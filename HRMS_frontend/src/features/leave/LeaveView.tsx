import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CalendarDays, PartyPopper, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { INPUT_CLASS, LABEL_CLASS, SELECT_CLASS } from '../../components/ui/formStyles';
import { toast } from '../../context/ToastContext';
import type { User } from '../../types';
import {
  hrApi,
  addDaysIso,
  formatDateRange,
  formatDay,
  formatDays,
  todayIso,
  type Holiday,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveRequestStatus,
  type LeaveType,
} from '../../services/hrApi';
import { ApplyLeaveModal } from './ApplyLeaveModal';
import { LeaveSetupTab } from './LeaveSetupTab';

type Tab = 'mine' | 'team' | 'holidays' | 'setup';

interface LeaveViewProps {
  currentUser: User | null;
}

export const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg';
const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const TD = 'px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 align-top';

const STATUS_TONE: Record<LeaveRequestStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'default',
};
const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const halfNote = (r: LeaveRequest) =>
  r.startHalf && r.endHalf ? ' (half days at both ends)' : r.startHalf ? ' (starts after first half)' : r.endHalf ? ' (ends after first half)' : '';

export const LeaveView: React.FC<LeaveViewProps> = ({ currentUser }) => {
  const role = currentUser?.role;
  const isHr = role === 'SUPER_ADMIN' || role === 'HR';
  const leadsPeople = isHr || role === 'MANAGER' || role === 'REPORTING_MANAGER' || role === 'HOD';
  const hasEmployeeRecord = Boolean(currentUser?.employeeId);

  const [tab, setTab] = useState<Tab>(hasEmployeeRecord ? 'mine' : leadsPeople ? 'team' : 'holidays');
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setLoadError(null);
    try {
      const types = await hrApi.getLeaveTypes();
      setLeaveTypes(types);
      if (hasEmployeeRecord) {
        const [b, r] = await Promise.all([hrApi.getLeaveBalances(), hrApi.getLeaveRequests('mine')]);
        setBalances(b);
        setMyRequests(r);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Could not load leave.');
    } finally {
      setIsLoading(false);
    }
  }, [hasEmployeeRecord]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const handleCancel = async (request: LeaveRequest) => {
    setCancellingId(request.id);
    try {
      await hrApi.cancelLeave(request.id);
      toast.success(request.status === 'PENDING' ? 'Request withdrawn.' : 'Leave cancelled and days credited back.', 'Leave cancelled');
      await loadMine();
    } catch (err: any) {
      toast.error(err.message || 'Could not cancel this leave.', 'Cancel failed');
    } finally {
      setCancellingId(null);
    }
  };

  const tabs = [
    ...(hasEmployeeRecord ? [{ value: 'mine' as const, label: 'My leave', icon: CalendarDays }] : []),
    ...(leadsPeople ? [{ value: 'team' as const, label: isHr ? 'Everyone' : 'My team', icon: Users }] : []),
    { value: 'holidays' as const, label: 'Holidays', icon: PartyPopper },
    ...(isHr ? [{ value: 'setup' as const, label: 'Distribute' }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave"
        description="Apply for leave, check your balance and see who is away."
        actions={
          <>
            <SegmentedControl options={tabs} value={tab} onChange={setTab} ariaLabel="Leave sections" />
            {hasEmployeeRecord && (
              <Button variant="primary" icon={CalendarPlus} onClick={() => setIsApplyOpen(true)} disabled={!leaveTypes.length}>
                Apply for leave
              </Button>
            )}
          </>
        }
      />

      {loadError && (
        <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button icon={RefreshCw} onClick={() => void loadMine()}>Try again</Button>
        </div>
      )}

      {tab === 'mine' && (
        <MyLeaveTab
          isLoading={isLoading}
          balances={balances}
          requests={myRequests}
          cancellingId={cancellingId}
          onCancel={handleCancel}
          onApply={() => setIsApplyOpen(true)}
        />
      )}
      {tab === 'team' && <TeamLeaveTab isHr={isHr} />}
      {tab === 'holidays' && <HolidaysTab canEdit={isHr} />}
      {tab === 'setup' && isHr && (
        <LeaveSetupTab isSuperAdmin={role === 'SUPER_ADMIN'} onChanged={() => void loadMine()} />
      )}

      <ApplyLeaveModal
        isOpen={isApplyOpen}
        onClose={() => setIsApplyOpen(false)}
        onApplied={() => void loadMine()}
        leaveTypes={leaveTypes}
        balances={balances}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// My leave
// ---------------------------------------------------------------------------
const MyLeaveTab: React.FC<{
  isLoading: boolean;
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  cancellingId: string | null;
  onCancel: (r: LeaveRequest) => void;
  onApply: () => void;
}> = ({ isLoading, balances, requests, cancellingId, onCancel, onApply }) => {
  const today = todayIso();
  const tracked = balances.filter((b) => b.requiresBalance);

  if (isLoading) {
    return <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>Loading your leave…</div>;
  }

  return (
    <div className="space-y-5">
      <section aria-label="Leave balances" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {tracked.map((b) => (
          <div key={b.leaveTypeId} className={`${CARD} p-3.5`}>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} aria-hidden="true" />
              <span className="truncate">{b.name}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{b.available}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">available</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {b.used} used this year{b.pending > 0 && ` · ${b.pending} awaiting approval`}
            </div>
          </div>
        ))}
      </section>

      <section className={CARD}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">My requests</h2>
        </div>
        {requests.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No leave requests yet"
            description="When you apply for leave, it shows here with its approval status."
            action={{ label: 'Apply for leave', onClick: onApply, icon: CalendarPlus }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className={TH}>Dates</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Days</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Reason</th>
                  <th className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r) => {
                  const canCancel = r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > today);
                  return (
                    <tr key={r.id}>
                      <td className={`${TD} whitespace-nowrap`}>
                        {formatDateRange(r.fromDate, r.toDate)}
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{halfNote(r).trim()}</span>
                      </td>
                      <td className={TD}>{r.leaveTypeName}</td>
                      <td className={`${TD} tabular-nums`}>{r.days}</td>
                      <td className={TD}>
                        <StatusBadge status={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} size="sm" />
                        {r.decidedByName && r.status !== 'CANCELLED' && (
                          <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            by {r.decidedByName}{r.decisionComment ? `: ${r.decisionComment}` : ''}
                          </span>
                        )}
                      </td>
                      <td className={`${TD} max-w-xs text-slate-600 dark:text-slate-400`}>{r.reason}</td>
                      <td className={`${TD} text-right`}>
                        {canCancel && (
                          <Button onClick={() => onCancel(r)} disabled={cancellingId === r.id}>
                            {cancellingId === r.id ? 'Cancelling…' : r.status === 'PENDING' ? 'Withdraw' : 'Cancel'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Team / everyone
// ---------------------------------------------------------------------------
const TeamLeaveTab: React.FC<{ isHr: boolean }> = ({ isHr }) => {
  const [status, setStatus] = useState<string>('');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [away, setAway] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([hrApi.getLeaveRequests(isHr ? 'all' : 'team', status || undefined), hrApi.getLeaveCalendar(today, addDaysIso(today, 30))])
      .then(([r, c]) => {
        if (cancelled) return;
        setRequests(r);
        setAway(c.filter((x) => x.status === 'APPROVED'));
      })
      .catch((err) => !cancelled && toast.error(err.message || 'Could not load team leave.', 'Load failed'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isHr, status, today]);

  const awayToday = away.filter((r) => r.fromDate <= today && r.toDate >= today);
  const upcoming = away.filter((r) => r.fromDate > today);

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <section className={`${CARD} lg:col-span-1 self-start`}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Who is away</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Approved leave, today and the next 30 days</p>
        </div>
        <div className="p-4 space-y-4">
          <AwayList title="Today" items={awayToday} empty="Nobody is on leave today." />
          <AwayList title="Coming up" items={upcoming} empty="No upcoming leave." />
        </div>
      </section>

      <section className={`${CARD} lg:col-span-2`}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{isHr ? 'All leave requests' : 'Team leave requests'}</h2>
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
            <option value="">All statuses</option>
            <option value="PENDING">Awaiting approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : requests.length === 0 ? (
          <EmptyState icon={Users} title="No leave requests" description="Requests from your team appear here. Approve or reject them from Approvals." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className={TH}>Employee</th>
                  <th className={TH}>Dates</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Days</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className={TD}>
                      <span className="font-medium text-slate-900 dark:text-white">{r.employeeName}</span>
                      {r.employeeCode && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{r.employeeCode}</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{formatDateRange(r.fromDate, r.toDate)}</td>
                    <td className={TD}>{r.leaveTypeName}</td>
                    <td className={`${TD} tabular-nums`}>{r.days}</td>
                    <td className={TD}><StatusBadge status={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const AwayList: React.FC<{ title: string; items: LeaveRequest[]; empty: string }> = ({ title, items, empty }) => (
  <div>
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
    {items.length === 0 ? (
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{empty}</p>
    ) : (
      <ul className="mt-1.5 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="text-sm">
            <span className="font-medium text-slate-900 dark:text-white">{r.employeeName}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {formatDateRange(r.fromDate, r.toDate)} · {formatDays(r.days)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------
const HolidaysTab: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    hrApi
      .getHolidays(year)
      .then(setHolidays)
      .catch((err) => toast.error(err.message || 'Could not load holidays.', 'Load failed'))
      .finally(() => setIsLoading(false));
  }, [year]);

  useEffect(load, [load]);

  const today = todayIso();
  const next = useMemo(() => holidays.find((h) => h.date >= today), [holidays, today]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;
    setIsSaving(true);
    try {
      await hrApi.addHoliday({ date, name: name.trim(), optional: isRestricted });
      setDate('');
      setName('');
      setIsRestricted(false);
      toast.success('Holiday added.', 'Saved');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Could not add the holiday.', 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    try {
      await hrApi.deleteHoliday(h.id);
      setHolidays((list) => list.filter((x) => x.id !== h.id));
    } catch (err: any) {
      toast.error(err.message || 'Could not delete the holiday.', 'Delete failed');
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <section className={`${CARD} lg:col-span-2`}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Holidays in {year}</h2>
            {next && year === thisYear && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Next: {next.name}, {formatDay(next.date)}</p>
            )}
          </div>
          <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={SELECT_CLASS}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : holidays.length === 0 ? (
          <EmptyState icon={PartyPopper} title={`No holidays set for ${year}`} description={canEdit ? 'Add your company holidays so they are not counted as leave.' : 'Your HR team has not published the holiday list yet.'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {holidays.map((h) => (
              <li key={h.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${h.date < today ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                    <span className="truncate">{h.name}</span>
                    {h.optional && <StatusBadge status="RH" tone="warning" size="sm" />}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{formatDay(h.date)}{h.locations?.length ? ` · ${h.locations.join(', ')}` : ''}</div>
                </div>
                {canEdit && (
                  <Button variant="ghost" icon={Trash2} aria-label={`Delete ${h.name}`} onClick={() => void handleDelete(h)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <form onSubmit={handleAdd} className={`${CARD} p-4 space-y-3 self-start`}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Add a holiday</h2>
          <div className="space-y-1">
            <label htmlFor="holiday-date" className={LABEL_CLASS}>Date</label>
            <input id="holiday-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="holiday-name" className={LABEL_CLASS}>Name</label>
            <input id="holiday-name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" className={INPUT_CLASS} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={isRestricted} onChange={(e) => setIsRestricted(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span>
              Restricted holiday (RH)
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">Optional: a working day unless the employee takes it as leave.</span>
            </span>
          </label>
          <Button variant="primary" type="submit" icon={Plus} disabled={isSaving || !date || !name.trim()}>
            {isSaving ? 'Adding…' : 'Add holiday'}
          </Button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Holidays apply to every location. Regular holidays are not counted as leave days.</p>
        </form>
      )}
    </div>
  );
};

