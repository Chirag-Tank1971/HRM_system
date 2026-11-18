import crypto from 'crypto';
import type { Request } from 'express';
import { getDbCollection } from '../db.js';
import { currentTenantId, runAsSystem, runWithTenant } from './tenantContext.js';

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface Tenant {
  id: string;
  /** Short company code used at login and in subdomains, e.g. "acme". */
  slug: string;
  name: string;
  status: TenantStatus;
  isDefault?: boolean;
  plan?: string;
  settings?: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  /** 1 = January … 12 = December. Indian companies usually use 4 (April). */
  fiscalYearStartMonth?: number;
  /** Month the leave year starts in. Defaults to 1 (January). */
  leaveYearStartMonth?: number;
  timezone?: string;
  currency?: string;
  /** Weekly-off days, 0 = Sunday … 6 = Saturday. Defaults to [0]. */
  weeklyOffDays?: number[];
  /**
   * First day leave is tracked in this system (YYYY-MM-DD). Automatic leave credits start
   * from this date; until HR sets it, nothing is credited automatically.
   */
  leaveAccrualStartDate?: string;
}

export const DEFAULT_TENANT_SETTINGS: Required<TenantSettings> = {
  fiscalYearStartMonth: 4,
  leaveYearStartMonth: 1,
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  weeklyOffDays: [0],
  leaveAccrualStartDate: '',
};

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Subdomains that are never a company code.
const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'admin', 'platform', 'static', 'mail', 'demo-admin']);

export function normalizeSlug(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

const canSignIn = (t: Tenant | null | undefined): t is Tenant =>
  Boolean(t) && (t!.status === 'ACTIVE' || t!.status === 'TRIAL');

// Short-lived cache: tenant status is checked on every authenticated request.
const TENANT_CACHE_TTL_MS = 60 * 1000;
const tenantCache = new Map<string, { tenant: Tenant | null; at: number }>();

export function invalidateTenantCache(tenantId?: string): void {
  if (tenantId) tenantCache.delete(tenantId);
  else tenantCache.clear();
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const hit = tenantCache.get(tenantId);
  if (hit && Date.now() - hit.at < TENANT_CACHE_TTL_MS) return hit.tenant;
  const tenant: Tenant | null = await runAsSystem(() => getDbCollection('tenants').findOne({ id: tenantId }));
  tenantCache.set(tenantId, { tenant, at: Date.now() });
  return tenant;
}

/** True when the tenant exists and its users are allowed to sign in and use the API. */
export async function isTenantUsable(tenantId: string): Promise<boolean> {
  return canSignIn(await getTenantById(tenantId));
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const clean = normalizeSlug(slug);
  if (!clean) return null;
  return runAsSystem(() => getDbCollection('tenants').findOne({ slug: clean }));
}

export async function listTenants(filter: Record<string, unknown> = {}): Promise<Tenant[]> {
  return runAsSystem(async () => (await getDbCollection('tenants').find(filter)).toArray());
}

/**
 * Runs `fn` once per usable tenant, each inside that tenant's context. One tenant failing does
 * not stop the others. Used by background jobs.
 */
export async function forEachTenant(
  fn: (tenant: Tenant) => Promise<void>,
  onError: (tenant: Tenant, err: unknown) => void = (t, err) =>
    console.error(`[Tenancy] Job failed for tenant '${t.slug}':`, err)
): Promise<void> {
  const tenants = (await listTenants()).filter(canSignIn);
  for (const tenant of tenants) {
    try {
      await runWithTenant(tenant.id, () => fn(tenant));
    } catch (err) {
      onError(tenant, err);
    }
  }
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: string;
  status?: TenantStatus;
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const slug = normalizeSlug(input.slug);
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Company name is required.');
  if (!isValidSlug(slug)) {
    throw new Error('Company code must be 1-40 characters: lowercase letters, digits and hyphens.');
  }
  if (await getTenantBySlug(slug)) throw new Error(`Company code '${slug}' is already in use.`);

  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: `tnt_${crypto.randomBytes(8).toString('hex')}`,
    slug,
    name,
    status: input.status ?? 'ACTIVE',
    plan: input.plan ?? 'TRIAL',
    settings: { fiscalYearStartMonth: 4, timezone: 'Asia/Kolkata', currency: 'INR' },
    createdAt: now,
    updatedAt: now,
  };
  await runAsSystem(() => getDbCollection('tenants').insertOne(tenant));
  invalidateTenantCache();
  return tenant;
}

export async function updateTenant(
  tenantId: string,
  patch: Partial<Pick<Tenant, 'name' | 'plan' | 'settings'>>
): Promise<void> {
  await runAsSystem(() =>
    getDbCollection('tenants').updateOne({ id: tenantId }, { $set: { ...patch, updatedAt: new Date().toISOString() } })
  );
  invalidateTenantCache(tenantId);
}

/** Settings of the company the current request/job is running for, with defaults filled in. */
export async function getCurrentTenantSettings(): Promise<Required<TenantSettings>> {
  const tenantId = currentTenantId();
  const tenant = tenantId ? await getTenantById(tenantId) : null;
  return { ...DEFAULT_TENANT_SETTINGS, ...(tenant?.settings || {}) };
}

export async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  await runAsSystem(() =>
    getDbCollection('tenants').updateOne({ id: tenantId }, { $set: { status, updatedAt: new Date().toISOString() } })
  );
  invalidateTenantCache(tenantId);
}

export type LoginTenantResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; code: 'COMPANY_CODE_REQUIRED' | 'COMPANY_NOT_FOUND' };

/** Company code from a subdomain such as acme.arisotech.in, when APP_BASE_DOMAIN is configured. */
function slugFromHost(req: Request): string {
  const baseDomain = (process.env.APP_BASE_DOMAIN || '').trim().toLowerCase();
  if (!baseDomain) return '';
  const candidates: string[] = [];
  try {
    if (req.headers.origin) candidates.push(new URL(String(req.headers.origin)).hostname.toLowerCase());
  } catch {
    // malformed Origin header: ignore
  }
  candidates.push(String(req.hostname || '').toLowerCase());
  for (const host of candidates) {
    if (host.endsWith(`.${baseDomain}`)) {
      const sub = host.slice(0, -(baseDomain.length + 1));
      if (sub && !sub.includes('.') && isValidSlug(sub)) return sub;
    }
  }
  return '';
}

/**
 * Works out which company a sign-in is for, before any credentials are checked:
 *  1. an explicit company code in the request body,
 *  2. the subdomain (when APP_BASE_DOMAIN is set),
 *  3. the only company on the platform, if there is exactly one.
 */
export async function resolveLoginTenant(req: Request): Promise<LoginTenantResult> {
  const explicit = normalizeSlug(req.body?.companyCode) || slugFromHost(req);
  if (explicit) {
    const tenant = await getTenantBySlug(explicit);
    return canSignIn(tenant) ? { ok: true, tenant } : { ok: false, code: 'COMPANY_NOT_FOUND' };
  }
  const usable = (await listTenants()).filter(canSignIn);
  if (usable.length === 1) return { ok: true, tenant: usable[0] };
  return { ok: false, code: 'COMPANY_CODE_REQUIRED' };
}
