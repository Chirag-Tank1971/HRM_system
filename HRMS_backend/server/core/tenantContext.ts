import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tenant context
 *
 * Every request, background job and script runs inside a context that names the company
 * (tenant) it is working for. The database layer reads this context and scopes every query
 * to that tenant, so application code cannot read or change another company's data by
 * forgetting a filter.
 *
 * Three states:
 *  - tenant context  → queries are scoped to that tenant (normal case)
 *  - system context  → queries are unscoped; only for boot, migrations and platform admin
 *  - no context      → data access throws (fail closed)
 */
export interface TenantStore {
  tenantId?: string;
  /** Unscoped access for platform-level code. Never set from request input. */
  system?: boolean;
  userId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class MissingTenantContextError extends Error {
  constructor(what: string) {
    super(`[Tenancy] ${what} was attempted outside a tenant context. Wrap the call in runWithTenant().`);
    this.name = 'MissingTenantContextError';
  }
}

/** Runs `fn` with all data access scoped to `tenantId`. */
export function runWithTenant<T>(tenantId: string, fn: () => T, extra: Partial<TenantStore> = {}): T {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new MissingTenantContextError('runWithTenant with an empty tenant id');
  }
  return storage.run({ ...extra, tenantId, system: false }, fn);
}

/** Runs `fn` with unscoped data access. Platform-level code only (boot, migrations, tenant admin). */
export function runAsSystem<T>(fn: () => T): T {
  return storage.run({ system: true }, fn);
}

export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}

/** The current tenant id, or undefined when in system context or outside any context. */
export function currentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

export function isSystemContext(): boolean {
  const s = storage.getStore();
  return Boolean(s?.system && !s.tenantId);
}

/** The current tenant id; throws when there is none. */
export function requireTenantId(what = 'Data access'): string {
  const id = storage.getStore()?.tenantId;
  if (!id) throw new MissingTenantContextError(what);
  return id;
}
