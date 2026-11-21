import crypto from 'crypto';
import { getDbCollection } from '../../db.js';
import { getCurrentTenantSettings } from '../../core/tenants.js';
import {
  cancelWorkflow,
  registerWorkflowHandler,
  startWorkflow,
  type WorkflowInstance,
} from '../../core/workflow.js';
import type { Employee, User } from '../../../src/types/index.js';

/**
 * Leave management: leave types, balances (as a ledger), requests, accrual and year-end.
 *
 * Balances are never stored as a number. Every credit and debit is a ledger row, and a balance
 * is the sum of those rows, so any figure can be explained line by line.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AccrualFrequency = 'NONE' | 'YEARLY' | 'MONTHLY';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LedgerEntryType =
  | 'OPENING' | 'ACCRUAL' | 'AVAILED' | 'CANCELLED' | 'ADJUSTMENT'
  | 'LAPSE' | 'ENCASHED' | 'COMP_OFF_CREDIT' | 'GRANT';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  /** Unpaid leave (loss of pay) reduces salary in payroll. */
  paid: boolean;
  color: string;
  /** Days granted per leave year. 0 for types with no fixed entitlement (LOP, comp-off). */
  annualQuota: number;
  accrual: AccrualFrequency;
  /** false = no balance needed to apply (e.g. loss of pay). */
  requiresBalance: boolean;
  /** Most days that can be carried into the next leave year. */
  carryForwardMax: number;
  /** Days above the carry-forward limit are paid out instead of lapsing. */
  encashable: boolean;
  allowHalfDay: boolean;
  maxConsecutiveDays?: number | null;
  /** Days of advance notice required. */
  noticeDays: number;
  /** How many days into the past a request may start. */
  backdatedDays: number;
  /** Weekly-offs and holidays between leave days count as leave. */
  sandwich: boolean;
  applicableDuringProbation: boolean;
  /** Can only be taken on dates HR has declared as restricted (optional) holidays. */
  restrictedHolidaysOnly?: boolean;
  gender?: 'Male' | 'Female' | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  departmentId?: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  /** Leave starts after the first half of fromDate. */
  startHalf: boolean;
  /** Leave ends after the first half of toDate. */
  endHalf: boolean;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  workflowInstanceId?: string;
  decidedByName?: string;
  decisionComment?: string;
  appliedAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  optional: boolean;
  /** Empty = applies to every location. */
  locations: string[];
}

export class LeaveError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Dates (all leave dates are plain YYYY-MM-DD business dates, handled in UTC)
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * 86400000));
const round2 = (n: number) => Math.round(n * 100) / 100;
const DISPLAY_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** 2026-11-27 → 27 Nov 2026, for text people read. */
const displayDate = (iso: string) => DISPLAY_DATE.format(toDate(iso));

/** Today's date in India (business dates do not follow the server's clock zone). */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** The leave year containing `iso`: its key (e.g. "2026" or "2026-27") and first/last day. */
export function leaveYearOf(iso: string, startMonth: number): { key: string; start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const key = startMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  return { key, start, end: toIso(endDate) };
}

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------
/**
 * Restricted holiday allowance: employees get a few days a year to use on any of the
 * optional holidays HR has declared (a common Indian practice; 2 a year by default).
 */
const RESTRICTED_HOLIDAY_TYPE: Partial<LeaveType> & { code: string; name: string } = {
  code: 'RH', name: 'Restricted Holiday', color: '#D97706', annualQuota: 2, accrual: 'YEARLY',
  allowHalfDay: false, maxConsecutiveDays: 1, backdatedDays: 7, restrictedHolidaysOnly: true,
};

const DEFAULT_LEAVE_TYPES: Array<Partial<LeaveType> & { code: string; name: string }> = [
  { code: 'CL', name: 'Casual Leave', color: '#6366F1', annualQuota: 12, accrual: 'MONTHLY', maxConsecutiveDays: 3, backdatedDays: 7 },
  { code: 'SL', name: 'Sick Leave', color: '#F59E0B', annualQuota: 12, accrual: 'MONTHLY', backdatedDays: 15 },
  { code: 'EL', name: 'Earned Leave', color: '#10B981', annualQuota: 15, accrual: 'MONTHLY', carryForwardMax: 30, encashable: true, noticeDays: 7, sandwich: true, applicableDuringProbation: false },
  { code: 'COMP', name: 'Compensatory Off', color: '#0EA5E9', annualQuota: 0, accrual: 'NONE', backdatedDays: 7 },
  { code: 'LOP', name: 'Loss of Pay', color: '#EF4444', paid: false, annualQuota: 0, accrual: 'NONE', requiresBalance: false, backdatedDays: 30 },
  RESTRICTED_HOLIDAY_TYPE,
];

function buildLeaveType(input: Partial<LeaveType> & { code: string; name: string }): LeaveType {
  const now = new Date().toISOString();
  return {
    id: `lt_${crypto.randomBytes(6).toString('hex')}`,
    paid: true,
    color: '#6366F1',
    annualQuota: 0,
    accrual: 'NONE',
    requiresBalance: true,
    carryForwardMax: 0,
    encashable: false,
    allowHalfDay: true,
    maxConsecutiveDays: null,
    noticeDays: 0,
    backdatedDays: 0,
    sandwich: false,
    applicableDuringProbation: true,
    gender: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...input,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
  };
}

/** Leave types for the current company; a standard Indian set is created on first use. */
export async function listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
  const col = getDbCollection('leaveTypes');
  let types: LeaveType[] = await (await col.find({})).toArray();
  if (types.length === 0) {
    for (const def of DEFAULT_LEAVE_TYPES) {
      try {
        await col.insertOne(buildLeaveType(def));
      } catch {
        // another request seeded it first
      }
    }
    types = await (await col.find({})).toArray();
  } else if (!types.some((t) => t.code === RESTRICTED_HOLIDAY_TYPE.code)) {
    // Companies set up before restricted holidays had an allowance get the type once.
    // HR can deactivate it from the leave types list if they don't use it.
    try {
      await col.insertOne(buildLeaveType(RESTRICTED_HOLIDAY_TYPE));
    } catch {
      // another request added it first
    }
    types = await (await col.find({})).toArray();
  }
  return types
    .filter((t) => includeInactive || t.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const EDITABLE_TYPE_FIELDS = [
  'name', 'paid', 'color', 'annualQuota', 'accrual', 'requiresBalance', 'carryForwardMax', 'encashable',
  'allowHalfDay', 'maxConsecutiveDays', 'noticeDays', 'backdatedDays', 'sandwich',
  'applicableDuringProbation', 'restrictedHolidaysOnly', 'gender', 'active',
] as const;

function cleanTypeInput(input: any): Partial<LeaveType> {
  const out: any = {};
  for (const key of EDITABLE_TYPE_FIELDS) if (input?.[key] !== undefined) out[key] = input[key];
  const num = (k: string, min: number, max: number) => {
    if (out[k] === undefined || out[k] === null) return;
    const n = Number(out[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw new LeaveError(`${k} must be between ${min} and ${max}.`);
    out[k] = n;
  };
  num('annualQuota', 0, 365); num('carryForwardMax', 0, 365); num('noticeDays', 0, 90);
  num('backdatedDays', 0, 365); num('maxConsecutiveDays', 1, 365);
  if (out.accrual !== undefined && !['NONE', 'YEARLY', 'MONTHLY'].includes(out.accrual)) throw new LeaveError('Invalid accrual frequency.');
  if (out.gender !== undefined && out.gender !== null && !['Male', 'Female'].includes(out.gender)) throw new LeaveError('Invalid gender restriction.');
  if (out.name !== undefined && !String(out.name).trim()) throw new LeaveError('Name is required.');
  if (out.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(out.color))) throw new LeaveError('Colour must be a hex value like #6366F1.');
  for (const k of ['paid', 'requiresBalance', 'encashable', 'allowHalfDay', 'sandwich', 'applicableDuringProbation', 'restrictedHolidaysOnly', 'active']) {
    if (out[k] !== undefined) out[k] = Boolean(out[k]);
  }
  return out;
}

export async function createLeaveType(input: any): Promise<LeaveType> {
  const code = String(input?.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,10}$/.test(code)) throw new LeaveError('Code must be 1-10 letters or digits.');
  if (!String(input?.name ?? '').trim()) throw new LeaveError('Name is required.');
  await listLeaveTypes(true); // make sure defaults exist before checking for a clash
  const col = getDbCollection('leaveTypes');
  if (await col.findOne({ code })) throw new LeaveError(`Leave type '${code}' already exists.`, 409);
  const type = buildLeaveType({ ...cleanTypeInput(input), code, name: String(input.name) });
  await col.insertOne(type);
  return type;
}

export async function updateLeaveType(id: string, input: any): Promise<LeaveType> {
  const col = getDbCollection('leaveTypes');
  const existing = await col.findOne({ id });
  if (!existing) throw new LeaveError('Leave type not found.', 404);
  await col.updateOne({ id }, { $set: { ...cleanTypeInput(input), updatedAt: new Date().toISOString() } });
  return col.findOne({ id });
}

// ---------------------------------------------------------------------------
// Holidays and working days
// ---------------------------------------------------------------------------
export async function listHolidays(from?: string, to?: string): Promise<Holiday[]> {
  const filter: any = {};
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const rows: Holiday[] = await (await getDbCollection('holidays').find(filter)).toArray();
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveHoliday(input: any, id?: string): Promise<Holiday> {
  if (!isIsoDate(input?.date)) throw new LeaveError('Date must be in YYYY-MM-DD format.');
  const name = String(input?.name ?? '').trim();
  if (!name) throw new LeaveError('Holiday name is required.');
  const locations = Array.isArray(input?.locations) ? input.locations.map((l: unknown) => String(l).trim()).filter(Boolean) : [];
  const col = getDbCollection('holidays');
  const doc = { date: input.date, name: name.slice(0, 120), optional: Boolean(input?.optional), locations };
  if (id) {
    if (!(await col.findOne({ id }))) throw new LeaveError('Holiday not found.', 404);
    await col.updateOne({ id }, { $set: doc });
    return col.findOne({ id });
  }
  const holiday: Holiday = { id: `hol_${crypto.randomBytes(6).toString('hex')}`, ...doc };
  await col.insertOne(holiday);
  return holiday;
}

export async function deleteHoliday(id: string): Promise<void> {
  await getDbCollection('holidays').deleteOne({ id });
}

const appliesTo = (h: Holiday, location?: string) =>
  !h.optional && (!h.locations?.length || (!!location && h.locations.some((l) => l.toLowerCase() === location.toLowerCase())));

export interface DayCount {
  days: number;
  /** Per-date breakdown, for explaining the total to the employee. */
  breakdown: Array<{ date: string; kind: 'LEAVE' | 'HALF' | 'WEEKLY_OFF' | 'HOLIDAY' | 'SANDWICH'; label?: string }>;
}

/**
 * Counts the leave days in a date range.
 * Weekly-offs and holidays are not counted, unless the leave type uses the sandwich rule, in
 * which case non-working days that fall between two leave days are counted too.
 */
export function countLeaveDays(
  from: string,
  to: string,
  opts: { startHalf?: boolean; endHalf?: boolean; sandwich?: boolean; weeklyOffDays: number[]; holidays: Map<string, string> }
): DayCount {
  const all = [...eachDay(from, to)].map((date) => {
    const weekday = toDate(date).getUTCDay();
    const holiday = opts.holidays.get(date);
    const off = holiday ? 'HOLIDAY' : opts.weeklyOffDays.includes(weekday) ? 'WEEKLY_OFF' : null;
    return { date, off, holiday };
  });
  const firstWork = all.findIndex((d) => !d.off);
  const lastWork = all.length - 1 - [...all].reverse().findIndex((d) => !d.off);
  if (firstWork === -1) return { days: 0, breakdown: all.map((d) => ({ date: d.date, kind: d.off as any, label: d.holiday })) };

  let days = 0;
  const breakdown: DayCount['breakdown'] = [];
  all.forEach((d, i) => {
    if (!d.off) {
      const half = (i === firstWork && opts.startHalf) || (i === lastWork && opts.endHalf);
      days += half ? 0.5 : 1;
      breakdown.push({ date: d.date, kind: half ? 'HALF' : 'LEAVE' });
    } else if (opts.sandwich && i > firstWork && i < lastWork) {
      days += 1;
      breakdown.push({ date: d.date, kind: 'SANDWICH', label: d.holiday || 'Weekly off' });
    } else {
      breakdown.push({ date: d.date, kind: d.off as 'WEEKLY_OFF' | 'HOLIDAY', label: d.holiday });
    }
  });
  // A single working day cannot be both a late start and an early finish.
  if (firstWork === lastWork && opts.startHalf && opts.endHalf) return { days: 0, breakdown };
  return { days: round2(days), breakdown };
}

async function holidayMapFor(employee: Pick<Employee, 'location'>, from: string, to: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const h of await listHolidays(from, to)) if (appliesTo(h, employee.location)) map.set(h.date, h.name);
  return map;
}

// ---------------------------------------------------------------------------
// Ledger and balances
// ---------------------------------------------------------------------------
interface LedgerInput {
  employeeId: string;
  leaveTypeId: string;
  date: string;
  type: LedgerEntryType;
  quantity: number;
  note?: string;
  refId?: string;
  /** Makes the entry safe to retry: a second write with the same key is ignored. */
  idempotencyKey?: string;
  createdBy?: string;
}

export async function addLedgerEntry(entry: LedgerInput): Promise<boolean> {
  const col = getDbCollection('leaveLedger');
  if (entry.idempotencyKey && (await col.findOne({ idempotencyKey: entry.idempotencyKey }))) return false;
  await col.insertOne({
    id: `ll_${crypto.randomBytes(8).toString('hex')}`,
    ...entry,
    quantity: round2(entry.quantity),
    createdAt: new Date().toISOString(),
  });
  return true;
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  paid: boolean;
  requiresBalance: boolean;
  /** Sum of all ledger entries. */
  balance: number;
  /** Days in requests still awaiting approval. */
  pending: number;
  /** What can be applied for now: balance minus pending. */
  available: number;
  /** Credits and usage within the current leave year. */
  credited: number;
  used: number;
}

export async function getBalances(employeeId: string, onDate: string = todayIso()): Promise<LeaveBalance[]> {
  // Independent reads, fetched together (one database round trip instead of four).
  const [settings, types, ledger, pending]: [Awaited<ReturnType<typeof getCurrentTenantSettings>>, LeaveType[], any[], LeaveRequest[]] = await Promise.all([
    getCurrentTenantSettings(),
    listLeaveTypes(),
    (async () => (await getDbCollection('leaveLedger').find({ employeeId })).toArray())(),
    (async () => (await getDbCollection('leaveRequests').find({ employeeId, status: 'PENDING' })).toArray())(),
  ]);
  const year = leaveYearOf(onDate, settings.leaveYearStartMonth);

  return types.map((t) => {
    const rows = ledger.filter((r) => r.leaveTypeId === t.id);
    const inYear = rows.filter((r) => r.date >= year.start && r.date <= year.end);
    const balance = round2(rows.reduce((s, r) => s + r.quantity, 0));
    const pendingDays = round2(pending.filter((p) => p.leaveTypeId === t.id).reduce((s, p) => s + p.days, 0));
    return {
      leaveTypeId: t.id, code: t.code, name: t.name, color: t.color, paid: t.paid, requiresBalance: t.requiresBalance,
      balance,
      pending: pendingDays,
      available: round2(balance - pendingDays),
      credited: round2(inYear.filter((r) => r.quantity > 0 && r.type !== 'CANCELLED').reduce((s, r) => s + r.quantity, 0)),
      used: round2(-inYear.filter((r) => r.type === 'AVAILED' || r.type === 'CANCELLED').reduce((s, r) => s + r.quantity, 0)),
    };
  });
}

export async function getLedger(employeeId: string, leaveTypeId?: string): Promise<any[]> {
  const rows: any[] = await (await getDbCollection('leaveLedger').find({ employeeId, ...(leaveTypeId ? { leaveTypeId } : {}) })).toArray();
  return rows.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

// ---------------------------------------------------------------------------
// Distribution: HR grants leave to many employees at once
// ---------------------------------------------------------------------------
export interface LeaveDistribution {
  leaveTypeId: string;
  /** Days to credit to each employee. */
  quantity: number;
  /** Who receives it. */
  scope: 'ALL' | 'DEPARTMENTS' | 'EMPLOYEES';
  departmentIds?: string[];
  employeeIds?: string[];
  note: string;
}

export interface DistributionResult {
  /** Employees who would be / were credited. */
  recipients: Array<{ employeeId: string; employeeCode: string; name: string; departmentName?: string }>;
  /** Employees in the selection who do not qualify, with the reason. */
  skipped: Array<{ employeeId: string; name: string; reason: string }>;
  credited: number;
  totalDays: number;
}

/**
 * Credits the same number of days of one leave type to a group of employees.
 * With `dryRun` nothing is written, so HR can see exactly who will receive it first.
 */
export async function distributeLeave(input: LeaveDistribution, actorId: string, dryRun = false): Promise<DistributionResult> {
  const type: LeaveType | null = await getDbCollection('leaveTypes').findOne({ id: input?.leaveTypeId });
  if (!type || type.active === false) throw new LeaveError('Choose a leave type.');
  if (!type.requiresBalance) throw new LeaveError(`${type.name} has no balance, so there is nothing to distribute.`);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 365 || Math.round(quantity * 2) !== quantity * 2) {
    throw new LeaveError('Days must be a positive number in steps of half a day.');
  }
  const note = String(input.note ?? '').trim();
  if (!dryRun && note.length < 3) throw new LeaveError('Give a reason for this distribution.');

  const filter: any = { status: { $in: ACTIVE_STATUSES } };
  if (input.scope === 'DEPARTMENTS') {
    if (!Array.isArray(input.departmentIds) || !input.departmentIds.length) throw new LeaveError('Choose at least one department.');
    filter.departmentId = { $in: input.departmentIds.map(String) };
  } else if (input.scope === 'EMPLOYEES') {
    if (!Array.isArray(input.employeeIds) || !input.employeeIds.length) throw new LeaveError('Choose at least one employee.');
    filter.id = { $in: input.employeeIds.map(String) };
  } else if (input.scope !== 'ALL') {
    throw new LeaveError('Choose who should receive the leave.');
  }

  const employees: Employee[] = await (await getDbCollection('employees').find(filter)).toArray();
  const result: DistributionResult = { recipients: [], skipped: [], credited: 0, totalDays: 0 };
  const batchId = `dist_${crypto.randomBytes(6).toString('hex')}`;
  const today = todayIso();

  for (const emp of employees.sort((a, b) => a.name.localeCompare(b.name))) {
    if (type.gender && emp.gender && type.gender !== emp.gender) {
      result.skipped.push({ employeeId: emp.id, name: emp.name, reason: `${type.name} is for ${type.gender.toLowerCase()} employees` });
      continue;
    }
    if (!type.applicableDuringProbation && emp.status === 'PROBATION') {
      result.skipped.push({ employeeId: emp.id, name: emp.name, reason: 'On probation' });
      continue;
    }
    result.recipients.push({ employeeId: emp.id, employeeCode: emp.employeeCode, name: emp.name, departmentName: emp.departmentName });
    if (!dryRun) {
      await addLedgerEntry({
        employeeId: emp.id, leaveTypeId: type.id, date: today, type: 'GRANT', quantity,
        note: note.slice(0, 300), refId: batchId, idempotencyKey: `GRANT:${batchId}:${emp.id}`, createdBy: actorId,
      });
    }
  }
  result.credited = dryRun ? 0 : result.recipients.length;
  result.totalDays = round2(result.recipients.length * quantity);
  return result;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export interface LeaveApplication {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  startHalf?: boolean;
  endHalf?: boolean;
  reason?: string;
}

export interface LeavePreview {
  days: number;
  breakdown: DayCount['breakdown'];
  available: number | null;
  /** Problems that would stop the request. Empty when it can be submitted. */
  errors: string[];
}

const ACTIVE_STATUSES = ['ACTIVE', 'PROBATION', 'NOTICE'];

/** Validates an application and works out the day count, without saving anything. */
export async function previewLeave(employee: Employee, input: LeaveApplication, opts: { byHr?: boolean; today?: string } = {}): Promise<LeavePreview & { type: LeaveType | null }> {
  const errors: string[] = [];
  const today = opts.today || todayIso();
  const type: LeaveType | null = await getDbCollection('leaveTypes').findOne({ id: input.leaveTypeId });
  if (!type || type.active === false) return { days: 0, breakdown: [], available: null, errors: ['Choose a leave type.'], type: null };

  if (!isIsoDate(input.fromDate) || !isIsoDate(input.toDate)) {
    return { days: 0, breakdown: [], available: null, errors: ['Choose the start and end dates.'], type };
  }
  if (input.toDate < input.fromDate) errors.push('The end date is before the start date.');
  if (toDate(input.toDate).getTime() - toDate(input.fromDate).getTime() > 180 * 86400000) errors.push('A single request can cover at most 180 days.');
  if (errors.length) return { days: 0, breakdown: [], available: null, errors, type };

  if ((input.startHalf || input.endHalf) && !type.allowHalfDay) errors.push(`${type.name} cannot be taken as a half day.`);
  if (type.gender && employee.gender && type.gender !== employee.gender) errors.push(`${type.name} is not available to you.`);
  if (!type.applicableDuringProbation && employee.status === 'PROBATION') errors.push(`${type.name} cannot be taken during probation.`);

  if (!opts.byHr) {
    if (input.fromDate < addDays(today, -type.backdatedDays)) {
      errors.push(type.backdatedDays ? `${type.name} can be applied at most ${type.backdatedDays} days after the leave date.` : `${type.name} cannot be applied for past dates.`);
    }
    if (type.noticeDays > 0 && input.fromDate > today && input.fromDate < addDays(today, type.noticeDays)) {
      errors.push(`${type.name} needs ${type.noticeDays} days' notice.`);
    }
  }

  const settings = await getCurrentTenantSettings();
  const holidays = await holidayMapFor(employee, input.fromDate, input.toDate);
  const count = countLeaveDays(input.fromDate, input.toDate, {
    startHalf: Boolean(input.startHalf), endHalf: Boolean(input.endHalf), sandwich: type.sandwich,
    weeklyOffDays: settings.weeklyOffDays, holidays,
  });
  if (count.days <= 0) errors.push('These dates contain no working days.');

  // Restricted-holiday leave: every leave day must be a declared restricted holiday.
  if (type.restrictedHolidaysOnly && count.days > 0) {
    const restricted = new Set(
      (await listHolidays(input.fromDate, input.toDate))
        .filter((h) => h.optional && (!h.locations?.length || (!!employee.location && h.locations.some((l) => l.toLowerCase() === String(employee.location).toLowerCase()))))
        .map((h) => h.date)
    );
    const notRestricted = count.breakdown.filter((d) => (d.kind === 'LEAVE' || d.kind === 'HALF' || d.kind === 'SANDWICH') && !restricted.has(d.date));
    if (notRestricted.length) {
      errors.push(`${type.name} can only be taken on a restricted holiday. ${notRestricted[0].date} is not one.`);
    }
  }
  if (type.maxConsecutiveDays && count.days > type.maxConsecutiveDays) {
    errors.push(`${type.name} can be taken for at most ${type.maxConsecutiveDays} days at a time.`);
  }

  const overlapping: LeaveRequest[] = await (
    await getDbCollection('leaveRequests').find({
      employeeId: employee.id, status: { $in: ['PENDING', 'APPROVED'] },
      fromDate: { $lte: input.toDate }, toDate: { $gte: input.fromDate },
    })
  ).toArray();
  if (overlapping.length) {
    const o = overlapping[0];
    errors.push(`You already have ${o.leaveTypeName} ${o.status === 'PENDING' ? 'awaiting approval' : 'approved'} from ${o.fromDate} to ${o.toDate}.`);
  }

  let available: number | null = null;
  if (type.requiresBalance) {
    available = (await getBalances(employee.id, today)).find((b) => b.leaveTypeId === type.id)?.available ?? 0;
    if (count.days > 0 && count.days > available) {
      errors.push(`Not enough ${type.name} balance: ${available} day(s) available, ${count.days} requested.`);
    }
  }
  return { days: count.days, breakdown: count.breakdown, available, errors, type };
}

export async function applyForLeave(user: User, employee: Employee, input: LeaveApplication, opts: { byHr?: boolean } = {}): Promise<LeaveRequest> {
  if (!ACTIVE_STATUSES.includes(employee.status)) throw new LeaveError('Leave can only be applied for active employees.');
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3) throw new LeaveError('Give a short reason for the leave.');
  const preview = await previewLeave(employee, input, opts);
  if (preview.errors.length || !preview.type) throw new LeaveError(preview.errors[0] || 'This leave cannot be applied.');

  const now = new Date().toISOString();
  const request: LeaveRequest = {
    id: `lr_${crypto.randomBytes(8).toString('hex')}`,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    departmentId: employee.departmentId,
    leaveTypeId: preview.type.id,
    leaveTypeCode: preview.type.code,
    leaveTypeName: preview.type.name,
    fromDate: input.fromDate,
    toDate: input.toDate,
    startHalf: Boolean(input.startHalf),
    endHalf: Boolean(input.endHalf),
    days: preview.days,
    reason: reason.slice(0, 500),
    status: 'PENDING',
    appliedAt: now,
    updatedAt: now,
  };
  const col = getDbCollection('leaveRequests');
  await col.insertOne(request);
  try {
    const dates = request.fromDate === request.toDate ? displayDate(request.fromDate) : `${displayDate(request.fromDate)} to ${displayDate(request.toDate)}`;
    const instance = await startWorkflow({
      requestType: 'LEAVE',
      requestId: request.id,
      title: `${request.leaveTypeName} · ${request.days} day${request.days === 1 ? '' : 's'}`,
      summary: `${dates} · ${request.reason}`,
      // The approval chain follows the employee on leave, even when HR applies on their behalf.
      requester: { id: user.id, name: employee.name, employeeId: employee.id },
      context: { days: request.days, leaveTypeCode: request.leaveTypeCode },
    });
    request.workflowInstanceId = instance.id;
    await col.updateOne({ id: request.id }, { $set: { workflowInstanceId: instance.id } });
  } catch (err: any) {
    await col.deleteOne({ id: request.id });
    throw new LeaveError(err?.message || 'Could not send this request for approval.');
  }
  return request;
}

async function closeRequest(instance: WorkflowInstance, status: LeaveRequestStatus): Promise<void> {
  const col = getDbCollection('leaveRequests');
  const request: LeaveRequest | null = await col.findOne({ id: instance.requestId });
  if (!request || request.status !== 'PENDING') return;
  const decided = [...instance.steps].reverse().find((s) => s.actedBy);
  await col.updateOne(
    { id: request.id },
    { $set: { status, decidedByName: decided?.actedByName, decisionComment: decided?.comment, updatedAt: new Date().toISOString() } }
  );
  if (status === 'APPROVED') {
    await addLedgerEntry({
      employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, date: request.fromDate,
      type: 'AVAILED', quantity: -request.days, refId: request.id,
      note: `${request.fromDate} to ${request.toDate}`, idempotencyKey: `AVAILED:${request.id}`,
    });
  }
}

registerWorkflowHandler('LEAVE', {
  onApproved: (i) => closeRequest(i, 'APPROVED'),
  onRejected: (i) => closeRequest(i, 'REJECTED'),
  onCancelled: (i) => closeRequest(i, 'CANCELLED'),
});

/**
 * Cancels a request. Pending requests are simply withdrawn. Approved leave can be cancelled by
 * the employee until it starts, and by HR at any time; the days are credited back.
 */
export async function cancelLeave(requestId: string, user: User, opts: { isHr: boolean; today?: string }): Promise<LeaveRequest> {
  const col = getDbCollection('leaveRequests');
  const request: LeaveRequest | null = await col.findOne({ id: requestId });
  if (!request) throw new LeaveError('Leave request not found.', 404);
  const isOwner = !!user.employeeId && request.employeeId === user.employeeId;
  if (!isOwner && !opts.isHr) throw new LeaveError('You can only cancel your own leave.', 403);

  if (request.status === 'PENDING') {
    const cancelled = await cancelWorkflow('LEAVE', request.id, opts.isHr ? { id: user.id, role: 'HR' } : user);
    if (!cancelled) await col.updateOne({ id: request.id }, { $set: { status: 'CANCELLED', updatedAt: new Date().toISOString() } });
    return col.findOne({ id: request.id });
  }
  if (request.status !== 'APPROVED') throw new LeaveError(`This request is already ${request.status.toLowerCase()}.`, 409);
  if (!opts.isHr && request.fromDate <= (opts.today || todayIso())) {
    throw new LeaveError('Leave that has already started can only be cancelled by HR.', 403);
  }
  await col.updateOne({ id: request.id }, { $set: { status: 'CANCELLED', updatedAt: new Date().toISOString() } });
  await addLedgerEntry({
    employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, date: request.fromDate,
    type: 'CANCELLED', quantity: request.days, refId: request.id,
    note: `Cancelled leave ${request.fromDate} to ${request.toDate}`, idempotencyKey: `CANCELLED:${request.id}`, createdBy: user.id,
  });
  return col.findOne({ id: request.id });
}

// ---------------------------------------------------------------------------
// Accrual and year-end
// ---------------------------------------------------------------------------
const monthKey = (iso: string) => iso.slice(0, 7);
function* monthsBetween(fromIso: string, toIso_: string): Generator<string> {
  let [y, m] = fromIso.split('-').map(Number);
  const end = monthKey(toIso_);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) return;
    yield key;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

/**
 * Credits leave that has become due up to `today`, for every active employee.
 * Safe to run any number of times: each credit has a key and is written once.
 *
 *  - MONTHLY types credit quota/12 for each month of the leave year so far.
 *  - YEARLY types credit the whole quota at the start of the leave year.
 *  - Someone who joined mid-year is credited from their joining month (a month counts when
 *    they joined on or before the 15th).
 */
export async function runLeaveAccrual(today: string = todayIso()): Promise<{ credited: number; employees: number; notStarted?: boolean }> {
  const settings = await getCurrentTenantSettings();
  // Nothing is credited until HR says from when leave is tracked here (opening balances are
  // entered separately), so switching the module on never invents past entitlements.
  const trackingFrom = settings.leaveAccrualStartDate;
  if (!isIsoDate(trackingFrom) || trackingFrom > today) return { credited: 0, employees: 0, notStarted: true };
  const year = leaveYearOf(today, settings.leaveYearStartMonth);
  const types = (await listLeaveTypes()).filter((t) => t.accrual !== 'NONE' && t.annualQuota > 0);
  if (!types.length) return { credited: 0, employees: 0 };

  const employees: Employee[] = await (await getDbCollection('employees').find({ status: { $in: ACTIVE_STATUSES } })).toArray();
  const existing: any[] = await (await getDbCollection('leaveLedger').find({ type: 'ACCRUAL', date: { $gte: year.start, $lte: year.end } })).toArray();
  const done = new Set(existing.map((e) => e.idempotencyKey));

  let credited = 0;
  for (const emp of employees) {
    const joined = isIsoDate(String(emp.joiningDate).slice(0, 10)) ? String(emp.joiningDate).slice(0, 10) : year.start;
    if (joined > today) continue;
    // First month that counts for this employee.
    let firstMonth = monthKey(joined);
    if (Number(joined.slice(8, 10)) > 15) firstMonth = monthKey(addDays(`${firstMonth}-28`, 7));
    const startMonth = [firstMonth, monthKey(year.start), monthKey(trackingFrom)].sort().pop()!;
    const monthsInYearForEmp = [...monthsBetween(`${startMonth}-01`, year.end)].length;

    for (const type of types) {
      if (type.gender && emp.gender && type.gender !== emp.gender) continue;
      if (type.accrual === 'YEARLY') {
        const key = `ACCRUAL:${type.id}:${emp.id}:${year.key}`;
        if (done.has(key) || monthsInYearForEmp <= 0) continue;
        const quantity = Math.round(((type.annualQuota * monthsInYearForEmp) / 12) * 2) / 2; // nearest half day
        if (quantity > 0 && (await addLedgerEntry({
          employeeId: emp.id, leaveTypeId: type.id, date: startMonth > monthKey(year.start) ? `${startMonth}-01` : year.start,
          type: 'ACCRUAL', quantity, note: `Annual credit for ${year.key}${monthsInYearForEmp < 12 ? ` (pro-rata, ${monthsInYearForEmp} months)` : ''}`,
          idempotencyKey: key,
        }))) credited++;
      } else {
        for (const month of monthsBetween(`${startMonth}-01`, today)) {
          const key = `ACCRUAL:${type.id}:${emp.id}:${month}`;
          if (done.has(key)) continue;
          if (await addLedgerEntry({
            employeeId: emp.id, leaveTypeId: type.id, date: `${month}-01`, type: 'ACCRUAL',
            quantity: type.annualQuota / 12, note: `Monthly credit for ${month}`, idempotencyKey: key,
          })) credited++;
        }
      }
    }
  }
  return { credited, employees: employees.length };
}

/**
 * Closes a leave year: balances above the carry-forward limit are encashed (if the type allows)
 * or lapse. Run once after the year ends; safe to re-run.
 */
export async function runLeaveYearEnd(yearEndDate: string, actorId: string): Promise<{ lapsed: number; encashed: number; rows: number }> {
  if (!isIsoDate(yearEndDate)) throw new LeaveError('Choose the last day of the leave year.');
  const settings = await getCurrentTenantSettings();
  const year = leaveYearOf(yearEndDate, settings.leaveYearStartMonth);
  if (yearEndDate !== year.end) throw new LeaveError(`The leave year ${year.key} ends on ${year.end}.`);
  if (year.end >= todayIso()) throw new LeaveError('Year-end can only be run after the leave year has finished.');

  const types = (await listLeaveTypes(true)).filter((t) => t.requiresBalance);
  const ledger: any[] = await (await getDbCollection('leaveLedger').find({ date: { $lte: year.end } })).toArray();
  const totals = new Map<string, number>();
  for (const row of ledger) totals.set(`${row.employeeId}|${row.leaveTypeId}`, (totals.get(`${row.employeeId}|${row.leaveTypeId}`) || 0) + row.quantity);

  let lapsed = 0, encashed = 0, rows = 0;
  for (const type of types) {
    for (const [key, total] of totals) {
      const [employeeId, leaveTypeId] = key.split('|');
      if (leaveTypeId !== type.id) continue;
      const excess = round2(total - type.carryForwardMax);
      if (excess <= 0) continue;
      const wrote = await addLedgerEntry({
        employeeId, leaveTypeId, date: year.end, type: type.encashable ? 'ENCASHED' : 'LAPSE', quantity: -excess,
        note: type.encashable ? `Encashed at year end ${year.key} (carry-forward limit ${type.carryForwardMax})` : `Lapsed at year end ${year.key} (carry-forward limit ${type.carryForwardMax})`,
        idempotencyKey: `YEAREND:${type.id}:${employeeId}:${year.key}`, createdBy: actorId,
      });
      if (wrote) {
        rows++;
        if (type.encashable) encashed = round2(encashed + excess); else lapsed = round2(lapsed + excess);
      }
    }
  }
  return { lapsed, encashed, rows };
}
