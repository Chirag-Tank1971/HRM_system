import { getDbCollection } from '../db.js';
import { currentTenantId } from './tenantContext.js';

/** Companies whose cycles were checked since this server started (one check is enough). */
const ensuredTenants = new Set<string>();

/**
 * The two appraisal cycles every company uses: June and September.
 *
 * Employees are placed in a cycle by joining month (January–July → June, August–December →
 * September); the appraisal for a cycle runs in its month. The ids match what the rest of the
 * app already expects (`cycle_d` = June, `cycle_f` = September).
 */
export const DEFAULT_CYCLES = [
  {
    id: 'cycle_d',
    code: 'JUN',
    name: 'June cycle',
    appraisalMonth: 6,
    colorHex: '#2a78d6',
    description: 'Annual appraisal in June, for employees who joined January to July.',
    active: true,
  },
  {
    id: 'cycle_f',
    code: 'SEP',
    name: 'September cycle',
    appraisalMonth: 9,
    colorHex: '#eb6834',
    description: 'Annual appraisal in September, for employees who joined August to December.',
    active: true,
  },
];

/**
 * Creates the June and September cycles for the current company if they are missing.
 * Existing cycles (matched by id or code) are never changed. Safe to call on every request.
 */
export async function ensureDefaultCycles(): Promise<void> {
  const tenantId = currentTenantId();
  if (tenantId && ensuredTenants.has(tenantId)) return;
  const col = getDbCollection('cycles');
  const existing: Array<{ id: string; code?: string }> = await (await col.find({})).toArray();
  for (const cycle of DEFAULT_CYCLES) {
    const present = existing.some(
      (c) => c.id === cycle.id || String(c.code || '').toUpperCase() === cycle.code || String(c.code || '').toUpperCase() === `CYCLE_${cycle.code}`
    );
    if (present) continue;
    try {
      await col.insertOne({ ...cycle, createdAt: new Date().toISOString() });
    } catch {
      // another request created it first
    }
  }
  if (tenantId) ensuredTenants.add(tenantId);
}
