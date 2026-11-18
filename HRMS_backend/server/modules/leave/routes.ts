import express, { Response } from 'express';
import { getDbCollection } from '../../db.js';
import { authenticateToken, recordAuditLog, requireRoles, AuthenticatedRequest } from '../../auth.js';
import type { Employee } from '../../../src/types/index.js';
import {
  addLedgerEntry,
  applyForLeave,
  cancelLeave,
  createLeaveType,
  deleteHoliday,
  distributeLeave,
  getBalances,
  getLedger,
  isIsoDate,
  LeaveError,
  listHolidays,
  listLeaveTypes,
  previewLeave,
  runLeaveAccrual,
  runLeaveYearEnd,
  saveHoliday,
  todayIso,
  updateLeaveType,
  type LeaveRequest,
} from './service.js';

export const leaveRouter = express.Router();
leaveRouter.use(['/leave', '/holidays'], authenticateToken);

const isHr = (req: AuthenticatedRequest) => req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'HR';
const hrOnly = requireRoles('SUPER_ADMIN', 'HR');

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof LeaveError) return res.status(err.status).json({ error: err.message });
  console.error(`[Leave] ${fallback}`, err);
  return res.status(500).json({ error: fallback });
}

/** Employees the signed-in user manages (direct reports, or the department for a HOD). */
async function teamOf(req: AuthenticatedRequest): Promise<Employee[]> {
  const me = req.user?.employeeId;
  if (!me) return [];
  const all: Employee[] = await (await getDbCollection('employees').find({})).toArray();
  return all.filter(
    (e) => e.id !== me && (e.managerId === me || (e.managerIds || []).includes(me) || (req.user!.role === 'HOD' && e.hodId === me))
  );
}

/** The employee a request is about: the caller by default, or `employeeId` when permitted. */
async function resolveEmployee(req: AuthenticatedRequest, employeeId?: string): Promise<Employee> {
  const targetId = employeeId || req.user?.employeeId;
  if (!targetId) throw new LeaveError('Your account is not linked to an employee record.', 400);
  const employee: Employee | null = await getDbCollection('employees').findOne({ id: targetId });
  if (!employee) throw new LeaveError('Employee not found.', 404);
  if (employee.id !== req.user?.employeeId && !isHr(req)) {
    const team = await teamOf(req);
    if (!team.some((e) => e.id === employee.id)) throw new LeaveError('You do not have access to this employee\'s leave.', 403);
  }
  return employee;
}

// ----- Leave types -----
leaveRouter.get('/leave/types', async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await listLeaveTypes(isHr(req) && req.query.all === 'true'));
  } catch (err) { fail(res, err, 'Failed to load leave types.'); }
});

leaveRouter.post('/leave/types', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const type = await createLeaveType(req.body);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_TYPE_CREATED', type.id, '', JSON.stringify(type), `Leave type ${type.code} created`);
    res.status(201).json(type);
  } catch (err) { fail(res, err, 'Failed to create leave type.'); }
});

leaveRouter.put('/leave/types/:id', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const type = await updateLeaveType(req.params.id, req.body);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_TYPE_UPDATED', type.id, '', JSON.stringify(req.body), `Leave type ${type.code} updated`);
    res.json(type);
  } catch (err) { fail(res, err, 'Failed to update leave type.'); }
});

// ----- Balances and ledger -----
leaveRouter.get('/leave/balances', async (req: AuthenticatedRequest, res) => {
  try {
    const employee = await resolveEmployee(req, req.query.employeeId as string | undefined);
    res.json(await getBalances(employee.id));
  } catch (err) { fail(res, err, 'Failed to load leave balances.'); }
});

leaveRouter.get('/leave/ledger', async (req: AuthenticatedRequest, res) => {
  try {
    const employee = await resolveEmployee(req, req.query.employeeId as string | undefined);
    res.json(await getLedger(employee.id, req.query.leaveTypeId as string | undefined));
  } catch (err) { fail(res, err, 'Failed to load the leave ledger.'); }
});

/** POST /api/leave/adjustments — HR credits or debits a balance, with a reason. */
leaveRouter.post('/leave/adjustments', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, leaveTypeId, note } = req.body || {};
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 365) throw new LeaveError('Enter a number of days (positive to credit, negative to debit).');
    if (!String(note ?? '').trim()) throw new LeaveError('Give a reason for the adjustment.');
    const employee = await resolveEmployee(req, employeeId);
    if (!(await getDbCollection('leaveTypes').findOne({ id: leaveTypeId }))) throw new LeaveError('Leave type not found.', 404);
    const type = req.body?.type === 'OPENING' ? 'OPENING' : req.body?.type === 'COMP_OFF_CREDIT' ? 'COMP_OFF_CREDIT' : 'ADJUSTMENT';
    await addLedgerEntry({ employeeId: employee.id, leaveTypeId, date: todayIso(), type, quantity, note: String(note).trim().slice(0, 300), createdBy: req.user!.id });
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_BALANCE_ADJUSTED', employee.id, '', String(quantity), `${type} of ${quantity} day(s) for ${employee.name}: ${note}`);
    res.status(201).json(await getBalances(employee.id));
  } catch (err) { fail(res, err, 'Failed to adjust the balance.'); }
});

/**
 * POST /api/leave/distribute — HR or a Super Admin grants days of one leave type to everyone,
 * to departments, or to selected employees. Send `preview: true` to see who would receive it
 * without crediting anything.
 */
leaveRouter.post('/leave/distribute', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const preview = req.body?.preview === true;
    const result = await distributeLeave(req.body, req.user!.id, preview);
    if (!preview) {
      await recordAuditLog(
        req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_DISTRIBUTED', String(req.body?.leaveTypeId), '',
        JSON.stringify({ quantity: req.body?.quantity, scope: req.body?.scope, credited: result.credited }),
        `Distributed ${req.body?.quantity} day(s) to ${result.credited} employee(s): ${String(req.body?.note).slice(0, 200)}`
      );
    }
    res.status(preview ? 200 : 201).json(result);
  } catch (err) { fail(res, err, 'Failed to distribute leave.'); }
});

// ----- Requests -----
leaveRouter.post('/leave/preview', async (req: AuthenticatedRequest, res) => {
  try {
    const employee = await resolveEmployee(req, req.body?.employeeId);
    const byHr = isHr(req) && employee.id !== req.user?.employeeId;
    const { type: _type, ...preview } = await previewLeave(employee, req.body, { byHr });
    res.json(preview);
  } catch (err) { fail(res, err, 'Failed to check this leave.'); }
});

leaveRouter.post('/leave/requests', async (req: AuthenticatedRequest, res) => {
  try {
    const onBehalf = req.body?.employeeId && req.body.employeeId !== req.user?.employeeId;
    if (onBehalf && !isHr(req)) throw new LeaveError('Only HR can apply leave for someone else.', 403);
    const employee = await resolveEmployee(req, req.body?.employeeId);
    const request = await applyForLeave(req.user!, employee, req.body, { byHr: Boolean(onBehalf) });
    res.status(201).json(request);
  } catch (err) { fail(res, err, 'Failed to apply for leave.'); }
});

/** GET /api/leave/requests?scope=mine|team|all&status=&from=&to= */
leaveRouter.get('/leave/requests', async (req: AuthenticatedRequest, res) => {
  try {
    const scope = String(req.query.scope || 'mine');
    const filter: any = {};
    if (scope === 'all') {
      if (!isHr(req)) throw new LeaveError('Only HR can see everyone\'s leave.', 403);
    } else if (scope === 'team') {
      filter.employeeId = { $in: (await teamOf(req)).map((e) => e.id) };
    } else {
      if (!req.user?.employeeId) return res.json([]);
      filter.employeeId = req.user.employeeId;
    }
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (isIsoDate(req.query.from)) filter.toDate = { $gte: req.query.from };
    if (isIsoDate(req.query.to)) filter.fromDate = { $lte: req.query.to };
    const rows: LeaveRequest[] = await (await getDbCollection('leaveRequests').find(filter)).sort({ fromDate: -1 }).limit(500).toArray();
    res.json(rows);
  } catch (err) { fail(res, err, 'Failed to load leave requests.'); }
});

leaveRouter.post('/leave/requests/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await cancelLeave(req.params.id, req.user!, { isHr: isHr(req) }));
  } catch (err) { fail(res, err, 'Failed to cancel this leave.'); }
});

/**
 * GET /api/leave/calendar?from=&to= — who is away.
 * HR sees everyone; managers see their team; everyone else sees approved leave in their own
 * department, with names and dates only (no leave type or reason).
 */
leaveRouter.get('/leave/calendar', async (req: AuthenticatedRequest, res) => {
  try {
    const from = isIsoDate(req.query.from) ? (req.query.from as string) : todayIso();
    const to = isIsoDate(req.query.to) ? (req.query.to as string) : from;
    const filter: any = { fromDate: { $lte: to }, toDate: { $gte: from } };
    let detailed = true;
    if (isHr(req)) {
      filter.status = { $in: ['PENDING', 'APPROVED'] };
    } else {
      const team = await teamOf(req);
      if (team.length) {
        filter.status = { $in: ['PENDING', 'APPROVED'] };
        filter.employeeId = { $in: [...team.map((e) => e.id), req.user!.employeeId].filter(Boolean) };
      } else {
        detailed = false;
        filter.status = 'APPROVED';
        const departmentId = req.employeeProfile?.departmentId;
        if (!departmentId) return res.json([]);
        filter.departmentId = departmentId;
      }
    }
    const rows: LeaveRequest[] = await (await getDbCollection('leaveRequests').find(filter)).sort({ fromDate: 1 }).limit(1000).toArray();
    res.json(
      rows.map((r) =>
        detailed || r.employeeId === req.user?.employeeId
          ? r
          : { id: r.id, employeeId: r.employeeId, employeeName: r.employeeName, fromDate: r.fromDate, toDate: r.toDate, days: r.days, status: r.status, startHalf: r.startHalf, endHalf: r.endHalf }
      )
    );
  } catch (err) { fail(res, err, 'Failed to load the leave calendar.'); }
});

/** GET /api/leave/restricted-holidays — upcoming restricted holidays the caller can take. */
leaveRouter.get('/leave/restricted-holidays', async (req: AuthenticatedRequest, res) => {
  try {
    const today = todayIso();
    const location = req.employeeProfile?.location;
    const rows = (await listHolidays(today, `${Number(today.slice(0, 4)) + 1}-12-31`)).filter(
      (h) => h.optional && (!h.locations?.length || (!!location && h.locations.some((l) => l.toLowerCase() === String(location).toLowerCase())))
    );
    res.json(rows);
  } catch (err) { fail(res, err, 'Failed to load restricted holidays.'); }
});

// ----- Holidays -----
leaveRouter.get('/holidays', async (req: AuthenticatedRequest, res) => {
  try {
    const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : todayIso().slice(0, 4);
    res.json(await listHolidays(`${year}-01-01`, `${year}-12-31`));
  } catch (err) { fail(res, err, 'Failed to load holidays.'); }
});

leaveRouter.post('/holidays', hrOnly, async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json(await saveHoliday(req.body)); } catch (err) { fail(res, err, 'Failed to add the holiday.'); }
});

leaveRouter.put('/holidays/:id', hrOnly, async (req: AuthenticatedRequest, res) => {
  try { res.json(await saveHoliday(req.body, req.params.id)); } catch (err) { fail(res, err, 'Failed to update the holiday.'); }
});

leaveRouter.delete('/holidays/:id', hrOnly, async (req: AuthenticatedRequest, res) => {
  try { await deleteHoliday(req.params.id); res.json({ success: true }); } catch (err) { fail(res, err, 'Failed to delete the holiday.'); }
});

// ----- HR operations -----
leaveRouter.post('/leave/accrual/run', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await runLeaveAccrual();
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_ACCRUAL_RUN', '', '', JSON.stringify(result), `Leave accrual run: ${result.credited} credit(s)`);
    res.json(result);
  } catch (err) { fail(res, err, 'Failed to run leave accrual.'); }
});

leaveRouter.post('/leave/year-end', hrOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await runLeaveYearEnd(String(req.body?.yearEndDate || ''), req.user!.id);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LEAVE', 'LEAVE_YEAR_END_RUN', '', '', JSON.stringify(result), `Leave year-end for ${req.body?.yearEndDate}`);
    res.json(result);
  } catch (err) { fail(res, err, 'Failed to run year-end processing.'); }
});

/** GET /api/leave/reports/balances — every active employee's balance per leave type (HR). */
leaveRouter.get('/leave/reports/balances', hrOnly, async (_req: AuthenticatedRequest, res) => {
  try {
    const types = await listLeaveTypes();
    const employees: Employee[] = await (await getDbCollection('employees').find({ status: { $in: ['ACTIVE', 'PROBATION', 'NOTICE'] } })).toArray();
    const ledger: any[] = await (await getDbCollection('leaveLedger').find({})).toArray();
    const totals = new Map<string, number>();
    for (const row of ledger) totals.set(`${row.employeeId}|${row.leaveTypeId}`, (totals.get(`${row.employeeId}|${row.leaveTypeId}`) || 0) + row.quantity);
    res.json({
      types: types.map((t) => ({ id: t.id, code: t.code, name: t.name })),
      rows: employees
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({
          employeeId: e.id, employeeCode: e.employeeCode, name: e.name, departmentName: e.departmentName,
          balances: Object.fromEntries(types.map((t) => [t.code, Math.round((totals.get(`${e.id}|${t.id}`) || 0) * 100) / 100])),
        })),
    });
  } catch (err) { fail(res, err, 'Failed to build the balance report.'); }
});
