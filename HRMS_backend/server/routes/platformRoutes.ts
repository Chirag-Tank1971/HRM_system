import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDbCollection } from '../db.js';
import { runWithTenant } from '../core/tenantContext.js';
import {
  createTenant,
  getTenantById,
  invalidateTenantCache,
  listTenants,
  setTenantStatus,
  updateTenant,
  type Tenant,
} from '../core/tenants.js';
import {
  authenticateToken,
  generateTempPassword,
  recordAuditLog,
  requireRoles,
  AuthenticatedRequest,
} from '../auth.js';
import { currentTenantId } from '../core/tenantContext.js';

/**
 * Platform administration: managing the companies (tenants) hosted on this installation.
 *
 * These endpoints are NOT part of any company's account. They are protected by a separate
 * secret, PLATFORM_ADMIN_KEY, sent in the `X-Platform-Key` header. When the key is not
 * configured the endpoints do not exist (404), so a default install exposes nothing.
 */
export const platformRouter = express.Router();

function requirePlatformKey(req: Request, res: Response, next: NextFunction) {
  const configured = (process.env.PLATFORM_ADMIN_KEY || '').trim();
  if (configured.length < 32) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  const supplied = String(req.headers['x-platform-key'] || '');
  const a = crypto.createHash('sha256').update(supplied).digest();
  const b = crypto.createHash('sha256').update(configured).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid platform key.' });
  }
  next();
}

platformRouter.use(requirePlatformKey);

const CreateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(1).max(40),
  plan: z.string().trim().max(40).optional(),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email().max(254),
});

async function tenantSummary(tenant: Tenant) {
  const counts = await runWithTenant(tenant.id, async () => ({
    users: await getDbCollection('users').countDocuments({}),
    employees: await getDbCollection('employees').countDocuments({}),
    activeEmployees: await getDbCollection('employees').countDocuments({ status: { $in: ['ACTIVE', 'PROBATION', 'NOTICE'] } }),
  }));
  return { ...tenant, counts };
}

/** GET /api/platform/tenants — every company with basic usage counts. */
platformRouter.get('/tenants', async (_req, res) => {
  try {
    const tenants = await listTenants();
    res.json(await Promise.all(tenants.map(tenantSummary)));
  } catch (err) {
    console.error('[Platform] list tenants failed:', err);
    res.status(500).json({ error: 'Failed to list companies.' });
  }
});

/**
 * POST /api/platform/tenants — creates a company and its first Super Admin.
 * The temporary password is returned once; the admin must change it at first sign-in.
 */
platformRouter.post('/tenants', async (req, res) => {
  const parsed = CreateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  const { name, slug, plan, adminName, adminEmail } = parsed.data;
  try {
    const tenant = await createTenant({ name, slug, plan });
    const tempPassword = generateTempPassword();
    const now = new Date().toISOString();
    await runWithTenant(tenant.id, async () => {
      await getDbCollection('users').insertOne({
        id: `usr_${crypto.randomBytes(6).toString('hex')}`,
        email: adminEmail,
        name: adminName,
        role: 'SUPER_ADMIN',
        roleId: 'role_super_admin',
        active: true,
        passwordHash: bcrypt.hashSync(tempPassword, 12),
        mustChangePassword: true,
        tokenVersion: 1,
        createdAt: now,
      });
      await getDbCollection('systemConfig').insertOne({
        id: 'global_config',
        hodApprovalEnabled: false,
        selfAssessmentEnabled: false,
        updatedAt: now,
      });
    });
    res.status(201).json({
      tenant,
      admin: { email: adminEmail, name: adminName, temporaryPassword: tempPassword },
      signIn: { companyCode: tenant.slug },
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create company.' });
  }
});

const UpdateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  plan: z.string().trim().max(40).optional(),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
});

/** PATCH /api/platform/tenants/:id — rename, change plan, suspend or reactivate. */
platformRouter.patch('/tenants/:id', async (req, res) => {
  const parsed = UpdateTenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update.' });
  const tenant = await getTenantById(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Company not found.' });
  try {
    const { status, ...rest } = parsed.data;
    if (Object.keys(rest).length) await updateTenant(tenant.id, rest);
    if (status) await setTenantStatus(tenant.id, status);
    invalidateTenantCache(tenant.id);
    res.json(await getTenantById(tenant.id));
  } catch (err) {
    console.error('[Platform] update tenant failed:', err);
    res.status(500).json({ error: 'Failed to update company.' });
  }
});

// ---------------------------------------------------------------------------
// Company settings, for the signed-in company's own Super Admin
// ---------------------------------------------------------------------------
export const companyRouter = express.Router();

const WEEKDAY = z.number().int().min(0).max(6);
const CompanySettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  settings: z
    .object({
      fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
      leaveYearStartMonth: z.number().int().min(1).max(12).optional(),
      timezone: z.string().trim().max(60).optional(),
      currency: z.string().trim().max(8).optional(),
      /** 0 = Sunday … 6 = Saturday */
      weeklyOffDays: z.array(WEEKDAY).max(7).optional(),
      leaveAccrualStartDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD').optional(),
    })
    .optional(),
});

/** GET /api/company — the signed-in user's company profile and settings. */
companyRouter.get('/company', authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  const tenant = await getTenantById(currentTenantId()!);
  if (!tenant) return res.status(404).json({ error: 'Company not found.' });
  res.json({ id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, plan: tenant.plan, settings: tenant.settings || {} });
});

/** PUT /api/company — Super Admin updates the company name and settings. */
companyRouter.put('/company', authenticateToken, requireRoles('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CompanySettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  const tenantId = currentTenantId()!;
  const tenant = await getTenantById(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Company not found.' });
  await updateTenant(tenantId, {
    ...(parsed.data.name ? { name: parsed.data.name } : {}),
    ...(parsed.data.settings ? { settings: { ...(tenant.settings || {}), ...parsed.data.settings } } : {}),
  });
  await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'COMPANY', 'SETTINGS_UPDATED', tenantId, '', JSON.stringify(parsed.data), 'Company settings updated');
  const updated = await getTenantById(tenantId);
  res.json({ id: updated!.id, name: updated!.name, slug: updated!.slug, status: updated!.status, plan: updated!.plan, settings: updated!.settings || {} });
});
