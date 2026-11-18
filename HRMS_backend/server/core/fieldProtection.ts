import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { ROLE_PERMISSIONS } from '../auth.js';

/**
 * Field-level protection for salary data on employee records.
 *
 * Applied to every API response in one place, so a new endpoint that returns employees cannot
 * leak salaries by forgetting a check. A user sees an employee's salary only when they hold
 * the SALARY_VIEW permission, or the record is their own.
 *
 * Appraisal and payroll records are not touched here: those modules apply their own rules.
 */
const SALARY_FIELDS = ['currentCtc', 'baseSalary', 'ctc', 'salary', 'salaryHistory'] as const;
const MAX_DEPTH = 12;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** An employee master record (not an appraisal, review or payroll row). */
function isEmployeeRecord(o: Record<string, unknown>): boolean {
  return (
    typeof o.employeeCode === 'string' &&
    'joiningDate' in o &&
    'designationId' in o &&
    !('appraisalYear' in o) &&
    !('reviewPeriodId' in o)
  );
}

/**
 * Returns a copy of `value` with salary fields removed from every employee record that is
 * not `ownEmployeeId`. Never mutates its input (stored documents may be shared references).
 */
export function redactSalaries<T>(value: T, ownEmployeeId?: string, depth = 0): T {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSalaries(v, ownEmployeeId, depth + 1)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;

  const hide = isEmployeeRecord(value) && (!ownEmployeeId || value.id !== ownEmployeeId);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (hide && (SALARY_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = redactSalaries(v, ownEmployeeId, depth + 1);
  }
  return out as T;
}

export function canViewSalaries(req: AuthenticatedRequest): boolean {
  if (!req.user) return false;
  if (req.permissions?.includes('SALARY_VIEW')) return true;
  return (ROLE_PERMISSIONS[req.user.role] || []).includes('SALARY_VIEW');
}

/** Express middleware: redacts salaries in JSON responses for users without SALARY_VIEW. */
export function salaryFieldGuard(req: Request, res: Response, next: NextFunction) {
  const send = res.json.bind(res);
  res.json = (body?: any) => {
    const authed = req as AuthenticatedRequest;
    // Unauthenticated responses (login, refresh) only ever carry the caller's own profile.
    if (authed.user && !canViewSalaries(authed)) {
      return send(redactSalaries(body, authed.user.employeeId));
    }
    return send(body);
  };
  next();
}
