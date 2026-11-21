import express, { Response } from 'express';
import { getDbCollection } from '../../db.js';
import { authenticateToken, AuthenticatedRequest } from '../../auth.js';
import { listPendingFor } from '../../core/workflow.js';
import { getBalances, todayIso } from '../leave/service.js';
import type { Employee } from '../../../src/types/index.js';

/**
 * GET /api/dashboard/insights
 *
 * Workforce, leave and calendar figures for the dashboard, computed from live records and
 * limited to what the viewer may see:
 *   - ORG  (Super Admin, HR, Management): everyone
 *   - DEPARTMENT (HOD): their department
 *   - TEAM (manager with reports): their direct reports
 *   - SELF (everyone else): only their own leave, plus holidays
 * No salary data is included.
 */
export const insightsRouter = express.Router();

type Scope = 'ORG' | 'DEPARTMENT' | 'TEAM' | 'SELF';

const ACTIVE = ['ACTIVE', 'PROBATION', 'NOTICE'];
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

const isoDay = (v?: string) => (v ? String(v).slice(0, 10) : '');
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const isActive = (e: Employee) => ACTIVE.includes(e.status) && !e.isPastEmployee;
const exitDateOf = (e: Employee) => isoDay(e.relievingDate || e.pastEmployeeDate);

/** Counts by a key, sorted largest first; small groups beyond `max` fold into "Other". */
function countBy<T>(items: T[], keyOf: (t: T) => string, max = 8): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it) || 'Not set';
    map.set(k, (map.get(k) || 0) + 1);
  }
  const sorted = [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.count, 0);
  return [...head, { label: 'Other', count: rest }];
}

/** The last `n` calendar months ending with the month containing `today`, oldest first. */
function lastMonths(today: string, n: number): Array<{ key: string; label: string; start: string; end: string }> {
  const [y, m] = today.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push({
      key: d.toISOString().slice(0, 7),
      // The year is shown on the first month and on January, e.g. "Dec '25", "Jan '26".
      label: `${MONTH_LABEL.format(d)}${d.getUTCMonth() === 0 || i === n - 1 ? ` '${String(d.getUTCFullYear()).slice(2)}` : ''}`,
      start: d.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
  }
  return out;
}

/** Days of a leave request that fall within [from, to], scaled for half days. */
function daysWithin(req: any, from: string, to: string): number {
  const start = req.fromDate > from ? req.fromDate : from;
  const end = req.toDate < to ? req.toDate : to;
  if (start > end) return 0;
  const spanAll = (new Date(`${req.toDate}T00:00:00Z`).getTime() - new Date(`${req.fromDate}T00:00:00Z`).getTime()) / 86400000 + 1;
  const spanIn = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000 + 1;
  // Requests store their working-day total; share it across the calendar span in proportion.
  return spanAll > 0 ? (req.days * spanIn) / spanAll : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

insightsRouter.get('/dashboard/insights', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const today = todayIso();
    const weekEnd = addDays(today, 6);
    const myEmployeeId = user.employeeId;

    // Every read this endpoint needs is independent: fetch them all in one round trip.
    const [allEmployees, departments, pendingForMe, myOpenRequests, holidaysAhead, leaveRequests, myBalances]: [
      Employee[], any[], unknown[], number, any[], any[], Awaited<ReturnType<typeof getBalances>> | null,
    ] = await Promise.all([
      (async () => (await getDbCollection('employees').find({})).toArray())(),
      user.role === 'HOD' ? (async () => (await getDbCollection('departments').find({})).toArray())() : Promise.resolve([]),
      listPendingFor(user.id),
      getDbCollection('workflowInstances').countDocuments({ requesterUserId: user.id, status: 'PENDING' }),
      (async () => (await getDbCollection('holidays').find({ date: { $gte: today } })).toArray())(),
      (async () => (await getDbCollection('leaveRequests').find({})).toArray())(),
      myEmployeeId ? getBalances(myEmployeeId, today) : Promise.resolve(null),
    ]);
    const me = myEmployeeId ? allEmployees.find((e) => e.id === myEmployeeId) : undefined;

    // ----- Who the viewer can see -----
    let scope: Scope = 'SELF';
    let scopeLabel = 'You';
    let inScope: Employee[] = me ? [me] : [];
    if (['SUPER_ADMIN', 'HR', 'MANAGEMENT'].includes(user.role)) {
      scope = 'ORG';
      scopeLabel = 'Organisation';
      inScope = allEmployees;
    } else if (user.role === 'HOD' && myEmployeeId) {
      const deptIds = new Set(departments.filter((d) => d.hodId === myEmployeeId).map((d) => d.id));
      if (me?.departmentId) deptIds.add(me.departmentId);
      scope = 'DEPARTMENT';
      scopeLabel = me?.departmentName || 'Your department';
      inScope = allEmployees.filter((e) => deptIds.has(e.departmentId) || e.hodId === myEmployeeId);
    } else if (myEmployeeId) {
      const team = allEmployees.filter((e) => e.id !== myEmployeeId && (e.managerId === myEmployeeId || (e.managerIds || []).includes(myEmployeeId)));
      if (team.length) {
        scope = 'TEAM';
        scopeLabel = 'Your team';
        inScope = team;
      }
    }
    const scopeIds = new Set(inScope.map((e) => e.id));
    const active = inScope.filter(isActive);

    // ----- Today: approvals, away, holidays -----
    const approvalsPending = pendingForMe.length;

    const upcomingHolidays = holidaysAhead
      .filter((h) => !h.locations?.length || !me?.location || h.locations.some((l: string) => l.toLowerCase() === String(me.location).toLowerCase()))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
      .map((h) => ({ date: h.date, name: h.name, optional: Boolean(h.optional) }));

    // Employees see who in their own department is away (names and dates only), like the calendar.
    const awayPool = scope === 'SELF' && me?.departmentId
      ? new Set(allEmployees.filter((e) => e.departmentId === me.departmentId).map((e) => e.id))
      : new Set([...scopeIds, ...(myEmployeeId ? [myEmployeeId] : [])]);
    const approvedAway = leaveRequests.filter((r) => r.status === 'APPROVED' && awayPool.has(r.employeeId));
    const awayToday = approvedAway
      .filter((r) => r.fromDate <= today && r.toDate >= today)
      .map((r) => ({ employeeId: r.employeeId, name: r.employeeName, toDate: r.toDate }));
    const awayThisWeek = approvedAway
      .filter((r) => r.fromDate <= weekEnd && r.toDate >= today)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate))
      .map((r) => ({ employeeId: r.employeeId, name: r.employeeName, fromDate: r.fromDate, toDate: r.toDate, days: r.days }));

    // ----- My leave -----
    let myLeave = null;
    if (me) {
      const balances = (myBalances || []).filter((b) => b.requiresBalance);
      const mine = leaveRequests.filter((r) => r.employeeId === me.id);
      myLeave = {
        balances: balances.map((b) => ({ code: b.code, name: b.name, color: b.color, available: b.available, used: b.used, credited: b.credited, pending: b.pending })),
        upcoming: mine
          .filter((r) => (r.status === 'APPROVED' || r.status === 'PENDING') && r.toDate >= today)
          .sort((a, b) => a.fromDate.localeCompare(b.fromDate))
          .slice(0, 4)
          .map((r) => ({ id: r.id, leaveTypeName: r.leaveTypeName, fromDate: r.fromDate, toDate: r.toDate, days: r.days, status: r.status })),
        usedThisYear: round1(
          mine.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + daysWithin(r, `${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`), 0)
        ),
      };
    }

    // Nothing more for someone who only sees themselves.
    if (scope === 'SELF') {
      return res.json({ generatedAt: new Date().toISOString(), today, scope, scopeLabel, approvalsPending, myOpenRequests, awayToday, awayThisWeek, upcomingHolidays, myLeave, workforce: null, leave: null, upcoming: null });
    }

    // ----- Workforce -----
    const months = lastMonths(today, 12);
    const trend = months.map((m) => {
      const joined = inScope.filter((e) => isoDay(e.joiningDate) >= m.start && isoDay(e.joiningDate) <= m.end).length;
      const left = inScope.filter((e) => {
        const x = exitDateOf(e);
        return x && x >= m.start && x <= m.end;
      }).length;
      const headcount = inScope.filter((e) => {
        const j = isoDay(e.joiningDate);
        const x = exitDateOf(e);
        const gone = (!ACTIVE.includes(e.status) || e.isPastEmployee) && (!x || x <= m.end);
        return j && j <= m.end && !gone;
      }).length;
      return { month: m.key, label: m.label, headcount, joined, left };
    });
    const thisMonth = trend[trend.length - 1];
    const lastYearJoined = trend.reduce((s, t) => s + t.joined, 0);
    const lastYearLeft = trend.reduce((s, t) => s + t.left, 0);
    const avgHeadcount = trend.reduce((s, t) => s + t.headcount, 0) / trend.length;

    const tenureYears = (e: Employee) => {
      const j = isoDay(e.joiningDate);
      return j ? (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${j}T00:00:00Z`).getTime()) / (365.25 * 86400000) : 0;
    };
    const tenureBands = [
      { label: 'Under 1 year', test: (y: number) => y < 1 },
      { label: '1–3 years', test: (y: number) => y >= 1 && y < 3 },
      { label: '3–5 years', test: (y: number) => y >= 3 && y < 5 },
      { label: '5+ years', test: (y: number) => y >= 5 },
    ].map((b) => ({ label: b.label, count: active.filter((e) => b.test(tenureYears(e))).length }));

    const workforce = {
      headcount: active.length,
      byStatus: {
        active: active.filter((e) => e.status === 'ACTIVE').length,
        probation: active.filter((e) => e.status === 'PROBATION').length,
        notice: active.filter((e) => e.status === 'NOTICE').length,
      },
      joinedThisMonth: thisMonth.joined,
      leftThisMonth: thisMonth.left,
      joinedLast12: lastYearJoined,
      leftLast12: lastYearLeft,
      // Attrition over the last 12 months: exits ÷ average headcount.
      attritionRate: avgHeadcount > 0 ? round1((lastYearLeft / avgHeadcount) * 100) : 0,
      averageTenureYears: active.length ? round1(active.reduce((s, e) => s + tenureYears(e), 0) / active.length) : 0,
      trend,
      byDepartment: countBy(active, (e) => e.departmentName || '', 10),
      byGender: countBy(active, (e) => (e.gender ? String(e.gender) : ''), 4),
      byEmploymentType: countBy(active, (e) => (e.employmentType ? String(e.employmentType) : ''), 4),
      byLocation: countBy(active, (e) => e.location || '', 6),
      tenureBands,
    };

    // ----- Leave in scope -----
    const scopedLeave = leaveRequests.filter((r) => scopeIds.has(r.employeeId));
    const approved = scopedLeave.filter((r) => r.status === 'APPROVED');
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const yearEnd = `${today.slice(0, 4)}-12-31`;
    const typeTotals = new Map<string, number>();
    for (const r of approved) {
      const d = daysWithin(r, yearStart, yearEnd);
      if (d > 0) typeTotals.set(r.leaveTypeName || r.leaveTypeCode, (typeTotals.get(r.leaveTypeName || r.leaveTypeCode) || 0) + d);
    }
    const leaveMonths = lastMonths(today, 6);
    const leave = {
      pendingRequests: scopedLeave.filter((r) => r.status === 'PENDING').length,
      daysThisMonth: round1(approved.reduce((s, r) => s + daysWithin(r, `${today.slice(0, 7)}-01`, leaveMonths[leaveMonths.length - 1].end), 0)),
      daysThisYear: round1([...typeTotals.values()].reduce((s, v) => s + v, 0)),
      byType: [...typeTotals.entries()].map(([label, days]) => ({ label, days: round1(days) })).sort((a, b) => b.days - a.days),
      trend: leaveMonths.map((m) => ({
        month: m.key,
        label: m.label,
        days: round1(approved.reduce((s, r) => s + daysWithin(r, m.start, m.end), 0)),
      })),
    };

    // ----- Upcoming people dates (next 30 days) -----
    const horizon = addDays(today, 30);
    const probationEnding = active
      .filter((e) => e.status === 'PROBATION' && e.joiningDate)
      .map((e) => ({ employeeId: e.id, name: e.name, date: addDays(isoDay(e.joiningDate), Number(e.probationPeriodDays) || 180) }))
      .filter((x) => x.date >= today && x.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date));
    const anniversaries = active
      .filter((e) => e.joiningDate)
      .map((e) => {
        const j = isoDay(e.joiningDate);
        let date = `${today.slice(0, 4)}${j.slice(4)}`;
        if (date < today) date = `${Number(today.slice(0, 4)) + 1}${j.slice(4)}`;
        return { employeeId: e.id, name: e.name, date, years: Number(date.slice(0, 4)) - Number(j.slice(0, 4)) };
      })
      .filter((x) => x.years >= 1 && x.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
    const leaving = active
      .filter((e) => e.status === 'NOTICE')
      .map((e) => ({ employeeId: e.id, name: e.name, date: exitDateOf(e) || null }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    res.json({
      generatedAt: new Date().toISOString(),
      today,
      scope,
      scopeLabel,
      approvalsPending,
      myOpenRequests,
      awayToday,
      awayThisWeek,
      upcomingHolidays,
      myLeave,
      workforce,
      leave,
      upcoming: { probationEnding, anniversaries, leaving },
    });
  } catch (err) {
    console.error('[Insights] Failed to build dashboard insights:', err);
    res.status(500).json({ error: 'Failed to load dashboard insights.' });
  }
});
