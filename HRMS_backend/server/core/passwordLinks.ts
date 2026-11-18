import crypto from 'crypto';
import { getDbCollection } from '../db.js';
import { currentTenantId, requireTenantId, runWithTenant } from './tenantContext.js';
import { getTenantById, isTenantUsable } from './tenants.js';
import { sendNotificationEmail } from '../services/emailService.js';
import { renderPasswordLinkEmail } from '../services/emailTemplates.js';

/**
 * Single-use password links: "forgot password" resets and first-time invites.
 *
 * Only a SHA-256 hash of the token is stored, so a database leak does not expose usable links.
 * The token itself names its tenant, so the reset page needs nothing but the link.
 */
export type PasswordLinkPurpose = 'RESET' | 'INVITE';

const TTL_MS: Record<PasswordLinkPurpose, number> = {
  RESET: 30 * 60 * 1000,
  INVITE: 3 * 24 * 60 * 60 * 1000,
};
const VALID_FOR_TEXT: Record<PasswordLinkPurpose, string> = { RESET: '30 minutes', INVITE: '3 days' };

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Creates a link token for a user of the current tenant. Earlier unused links of the same kind are cancelled. */
export async function issuePasswordLink(userId: string, purpose: PasswordLinkPurpose): Promise<string> {
  const tenantId = requireTenantId('Issuing a password link');
  const token = `${Buffer.from(tenantId).toString('base64url')}.${crypto.randomBytes(32).toString('base64url')}`;
  const now = Date.now();
  const col = getDbCollection('authTokens');
  await col.updateMany({ userId, purpose, usedAt: null }, { $set: { usedAt: new Date(now).toISOString(), cancelled: true } });
  await col.insertOne({
    id: `atk_${crypto.randomBytes(8).toString('hex')}`,
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + TTL_MS[purpose]).toISOString(),
    usedAt: null,
    createdAt: new Date(now).toISOString(),
  });
  return token;
}

export function passwordLinkUrl(token: string): string {
  const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Issues a link and emails it. Returns false when the email could not be sent or was skipped. */
export async function sendPasswordLink(
  user: { id: string; email: string; name: string },
  purpose: PasswordLinkPurpose
): Promise<boolean> {
  const token = await issuePasswordLink(user.id, purpose);
  const tenant = await getTenantById(currentTenantId()!);
  const { subject, html } = renderPasswordLinkEmail({
    name: user.name,
    link: passwordLinkUrl(token),
    validFor: VALID_FOR_TEXT[purpose],
    kind: purpose,
    companyName: tenant?.name,
  });
  const log = await sendNotificationEmail({
    recipientId: user.id,
    recipientEmail: user.email,
    recipientName: user.name,
    subject,
    html,
    templateType: purpose === 'INVITE' ? 'ACCOUNT_INVITE' : 'PASSWORD_RESET',
  });
  return log.status === 'SENT';
}

function tenantIdFromToken(token: string): string | null {
  const [head, tail] = String(token || '').split('.');
  if (!head || !tail || tail.length < 20) return null;
  try {
    const tenantId = Buffer.from(head, 'base64url').toString('utf8');
    return /^tnt_[a-z0-9_]+$/i.test(tenantId) ? tenantId : null;
  } catch {
    return null;
  }
}

/**
 * Validates a link token and runs `fn` inside its tenant with the matching user.
 * The token is marked used only when `fn` completes, so a failed attempt (e.g. a weak
 * password) can be retried with the same link.
 */
export async function redeemPasswordLink<T>(
  token: string,
  fn: (user: any, purpose: PasswordLinkPurpose) => Promise<T>
): Promise<{ ok: true; result: T } | { ok: false }> {
  const tenantId = tenantIdFromToken(token);
  if (!tenantId || !(await isTenantUsable(tenantId))) return { ok: false };

  return runWithTenant(tenantId, async () => {
    const col = getDbCollection('authTokens');
    const record = await col.findOne({ tokenHash: hashToken(token) });
    if (!record || record.usedAt || new Date(record.expiresAt).getTime() < Date.now()) return { ok: false as const };

    const user = await getDbCollection('users').findOne({ id: record.userId });
    if (!user || user.active === false) return { ok: false as const };

    const result = await fn(user, record.purpose);
    await col.updateOne({ id: record.id }, { $set: { usedAt: new Date().toISOString() } });
    return { ok: true as const, result };
  });
}
