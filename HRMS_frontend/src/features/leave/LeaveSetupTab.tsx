import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Play, Plus, Search, Share2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { INPUT_CLASS, LABEL_CLASS } from '../../components/ui/formStyles';
import { toast } from '../../context/ToastContext';
import type { Employee } from '../../types';
import { hrApi, formatDate, type Company, type LeaveBalanceReport, type LeaveType } from '../../services/hrApi';
import { DistributeLeaveModal } from './DistributeLeaveModal';

const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ACCRUAL_LABEL = { NONE: 'Not credited automatically', MONTHLY: 'Credited monthly', YEARLY: 'Credited once a year' } as const;

interface LeaveSetupTabProps {
  isSuperAdmin: boolean;
  employees: Employee[];
  onChanged: () => void;
}

export const LeaveSetupTab: React.FC<LeaveSetupTabProps> = ({ isSuperAdmin, employees, onChanged }) => {
  const [company, setCompany] = useState<Company | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [editing, setEditing] = useState<Partial<LeaveType> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDistributeOpen, setIsDistributeOpen] = useState(false);
  const [report, setReport] = useState<LeaveBalanceReport | null>(null);

  const load = useCallback(() => {
    Promise.all([hrApi.getCompany(), hrApi.getLeaveTypes(true), hrApi.getLeaveBalanceReport()])
      .then(([c, t, r]) => {
        setCompany(c);
        setTypes(t);
        setReport(r);
      })
      .catch((err) => toast.error(err.message || 'Could not load leave setup.', 'Load failed'));
  }, []);

  useEffect(load, [load]);

  const handleRunAccrual = async () => {
    setIsRunning(true);
    try {
      const result = await hrApi.runLeaveAccrual();
      if (result.notStarted) toast.info('Set the date leave tracking starts from first.', 'Nothing credited');
      else toast.success(result.credited ? `${result.credited} credit(s) added across ${result.employees} employees.` : 'Everything was already up to date.', 'Leave credited');
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Could not credit leave.', 'Failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <TrackingCard company={company} canEdit={isSuperAdmin} onSaved={(c) => { setCompany(c); onChanged(); }} />
        <AdjustBalanceCard employees={employees} types={types.filter((t) => t.active && t.requiresBalance)} onSaved={() => { load(); onChanged(); }} />
      </div>

      <BalancesTable report={report} onDistribute={() => setIsDistributeOpen(true)} />

      <section className={CARD}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Leave types</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Entitlements and rules for each kind of leave</p>
          </div>
          <div className="flex gap-2">
            <Button icon={Play} onClick={() => void handleRunAccrual()} disabled={isRunning} title="Credits any leave that has become due. Also runs automatically every night.">
              {isRunning ? 'Crediting…' : 'Credit due leave now'}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ paid: true, requiresBalance: true, allowHalfDay: true, accrual: 'MONTHLY', annualQuota: 0, color: '#6366F1', applicableDuringProbation: true })}>
              Add leave type
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Leave type</th>
                <th className="px-3 py-2">Days a year</th>
                <th className="px-3 py-2">Credited</th>
                <th className="px-3 py-2">Carry forward</th>
                <th className="px-3 py-2">Rules</th>
                <th className="px-3 py-2"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {types.map((t) => (
                <tr key={t.id} className={t.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                      {t.name}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t.code}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{t.annualQuota || '—'}</td>
                  <td className="px-3 py-2.5">{ACCRUAL_LABEL[t.accrual]}</td>
                  <td className="px-3 py-2.5 tabular-nums">{t.requiresBalance ? `Up to ${t.carryForwardMax}${t.encashable ? ', rest encashed' : ', rest lapses'}` : '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {!t.paid && <StatusBadge status="Unpaid" tone="danger" size="sm" />}
                      {t.sandwich && <StatusBadge status="Sandwich rule" size="sm" />}
                      {t.noticeDays > 0 && <StatusBadge status={`${t.noticeDays} days' notice`} size="sm" />}
                      {t.maxConsecutiveDays ? <StatusBadge status={`Max ${t.maxConsecutiveDays} at a time`} size="sm" /> : null}
                      {!t.active && <StatusBadge status="Inactive" tone="warning" size="sm" />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" icon={Pencil} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LeaveTypeModal type={editing} onClose={() => setEditing(null)} onSaved={() => { load(); onChanged(); }} />
      <DistributeLeaveModal
        isOpen={isDistributeOpen}
        onClose={() => setIsDistributeOpen(false)}
        onDistributed={() => { load(); onChanged(); }}
        leaveTypes={types.filter((t) => t.active && t.requiresBalance)}
        employees={employees}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Everyone's balances, with the entry point for distributing leave
// ---------------------------------------------------------------------------
const BalancesTable: React.FC<{ report: LeaveBalanceReport | null; onDistribute: () => void }> = ({ report, onDistribute }) => {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = (report?.rows || []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q) || (r.departmentName || '').toLowerCase().includes(q)
  );
  // Types with no balance (loss of pay) are left out of the table.
  const types = (report?.types || []).filter((t) => (report?.rows || []).some((r) => r.balances[t.code] !== 0) || t.code !== 'LOP');

  return (
    <section className={CARD}>
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Leave balances</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Current balance of every active employee, in days</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
            <Search className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search employees"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-32 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>
          <Button variant="primary" icon={Share2} onClick={onDistribute}>Distribute leave</Button>
        </div>
      </div>
      {!report ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {report.rows.length === 0 ? 'No active employees yet.' : 'No employees match your search.'}
        </div>
      ) : (
        <div className="overflow-auto max-h-96">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-3 py-2">Department</th>
                {types.map((t) => (
                  <th key={t.id} className="px-3 py-2 text-right" title={t.name}>{t.code}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                    <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">{r.employeeCode}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.departmentName || '—'}</td>
                  {types.map((t) => {
                    const value = r.balances[t.code] ?? 0;
                    return (
                      <td key={t.id} className={`px-3 py-2 text-right tabular-nums ${value < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Leave tracking settings
// ---------------------------------------------------------------------------
const TrackingCard: React.FC<{ company: Company | null; canEdit: boolean; onSaved: (c: Company) => void }> = ({ company, canEdit, onSaved }) => {
  const [startDate, setStartDate] = useState('');
  const [yearStart, setYearStart] = useState(1);
  const [weeklyOff, setWeeklyOff] = useState<number[]>([0]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setStartDate(company.settings.leaveAccrualStartDate || '');
    setYearStart(company.settings.leaveYearStartMonth || 1);
    setWeeklyOff(company.settings.weeklyOffDays || [0]);
  }, [company]);

  const toggleDay = (day: number) => setWeeklyOff((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await hrApi.updateCompany({ settings: { leaveAccrualStartDate: startDate, leaveYearStartMonth: yearStart, weeklyOffDays: weeklyOff } });
      toast.success('Leave settings saved.', 'Saved');
      onSaved(updated);
    } catch (err: any) {
      toast.error(err.message || 'Could not save settings.', 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={`${CARD} p-4 space-y-3`}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Leave tracking</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {company?.settings.leaveAccrualStartDate
            ? `Leave is credited automatically from ${formatDate(company.settings.leaveAccrualStartDate)}.`
            : 'Automatic leave credits are off until a start date is set. Enter opening balances first, then set the date.'}
        </p>
      </div>
      <fieldset disabled={!canEdit || isSaving} className="space-y-3 disabled:opacity-70">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="leave-start" className={LABEL_CLASS}>Credit leave automatically from</label>
            <input id="leave-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="leave-year" className={LABEL_CLASS}>Leave year starts in</label>
            <select id="leave-year" value={yearStart} onChange={(e) => setYearStart(Number(e.target.value))} className={INPUT_CLASS}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <span className={LABEL_CLASS}>Weekly off</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, day) => (
              <button
                key={label}
                type="button"
                aria-pressed={weeklyOff.includes(day)}
                onClick={() => toggleDay(day)}
                className={`h-8 px-3 rounded-md border text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  weeklyOff.includes(day)
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
      {canEdit ? (
        <Button variant="primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save settings'}</Button>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Only a Super Admin can change these settings.</p>
      )}
    </form>
  );
};

// ---------------------------------------------------------------------------
// Balance adjustments
// ---------------------------------------------------------------------------
const AdjustBalanceCard: React.FC<{ employees: Employee[]; types: LeaveType[]; onSaved: () => void }> = ({ employees, types, onSaved }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'OPENING' | 'ADJUSTMENT' | 'COMP_OFF_CREDIT'>('OPENING');
  const [isSaving, setIsSaving] = useState(false);

  const active = employees.filter((e) => e.status !== 'INACTIVE' && !e.isPastEmployee).sort((a, b) => a.name.localeCompare(b.name));
  const qty = Number(quantity);
  const canSave = employeeId && leaveTypeId && Number.isFinite(qty) && qty !== 0 && note.trim().length > 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    try {
      await hrApi.adjustLeaveBalance({ employeeId, leaveTypeId, quantity: qty, note: note.trim(), type: kind });
      toast.success(`${qty > 0 ? 'Credited' : 'Debited'} ${Math.abs(qty)} day(s).`, 'Balance updated');
      setQuantity('');
      setNote('');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Could not update the balance.', 'Failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={`${CARD} p-4 space-y-3`}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Opening balances and adjustments</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Every change is recorded in the employee's leave ledger with your reason.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="adj-emp" className={LABEL_CLASS}>Employee</label>
          <select id="adj-emp" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={INPUT_CLASS}>
            <option value="">Choose…</option>
            {active.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="adj-type" className={LABEL_CLASS}>Leave type</label>
          <select id="adj-type" required value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className={INPUT_CLASS}>
            <option value="">Choose…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="adj-kind" className={LABEL_CLASS}>Kind</label>
          <select id="adj-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={INPUT_CLASS}>
            <option value="OPENING">Opening balance</option>
            <option value="ADJUSTMENT">Correction</option>
            <option value="COMP_OFF_CREDIT">Comp-off earned</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="adj-qty" className={LABEL_CLASS}>Days (negative to deduct)</label>
          <input id="adj-qty" type="number" step="0.5" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INPUT_CLASS} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="adj-note" className={LABEL_CLASS}>Reason</label>
        <input id="adj-note" type="text" required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Balance carried over from the previous system" className={INPUT_CLASS} />
      </div>
      <Button variant="primary" type="submit" disabled={!canSave || isSaving}>{isSaving ? 'Saving…' : 'Update balance'}</Button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Leave type editor
// ---------------------------------------------------------------------------
const LeaveTypeModal: React.FC<{ type: Partial<LeaveType> | null; onClose: () => void; onSaved: () => void }> = ({ type, onClose, onSaved }) => {
  const [form, setForm] = useState<Partial<LeaveType>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !type?.id;

  useEffect(() => {
    if (type) {
      setForm(type);
      setError(null);
    }
  }, [type]);

  const set = <K extends keyof LeaveType>(key: K, value: LeaveType[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = (key: keyof LeaveType) => (e: React.ChangeEvent<HTMLInputElement>) => set(key, (e.target.value === '' ? 0 : Number(e.target.value)) as never);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = { ...form, maxConsecutiveDays: form.maxConsecutiveDays || null };
      if (isNew) await hrApi.createLeaveType(payload);
      else await hrApi.updateLeaveType(type!.id!, payload);
      toast.success(`${form.name} saved.`, 'Leave type saved');
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save the leave type.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = (key: keyof LeaveType, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
      <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked as never)} className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
      <span>{label}{hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}</span>
    </label>
  );

  return (
    <Modal
      isOpen={!!type}
      onClose={onClose}
      title={isNew ? 'Add leave type' : `Edit ${type?.name || 'leave type'}`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" type="submit" form="leave-type-form" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form id="leave-type-form" onSubmit={handleSave} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="lt-name" className={LABEL_CLASS}>Name</label>
            <input id="lt-name" required maxLength={60} value={form.name || ''} onChange={(e) => set('name', e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-code" className={LABEL_CLASS}>Code</label>
            <input id="lt-code" required maxLength={10} disabled={!isNew} value={form.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="e.g. ML" className={INPUT_CLASS} />
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="lt-quota" className={LABEL_CLASS}>Days a year</label>
            <input id="lt-quota" type="number" min={0} max={365} step="0.5" value={form.annualQuota ?? 0} onChange={num('annualQuota')} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-accrual" className={LABEL_CLASS}>Credited</label>
            <select id="lt-accrual" value={form.accrual || 'NONE'} onChange={(e) => set('accrual', e.target.value as LeaveType['accrual'])} className={INPUT_CLASS}>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Once a year</option>
              <option value="NONE">Not automatically</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-carry" className={LABEL_CLASS}>Carry forward up to</label>
            <input id="lt-carry" type="number" min={0} max={365} value={form.carryForwardMax ?? 0} onChange={num('carryForwardMax')} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-notice" className={LABEL_CLASS}>Notice needed (days)</label>
            <input id="lt-notice" type="number" min={0} max={90} value={form.noticeDays ?? 0} onChange={num('noticeDays')} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-back" className={LABEL_CLASS}>Can apply after (days)</label>
            <input id="lt-back" type="number" min={0} max={365} value={form.backdatedDays ?? 0} onChange={num('backdatedDays')} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="lt-max" className={LABEL_CLASS}>Most days at a time</label>
            <input id="lt-max" type="number" min={0} max={365} value={form.maxConsecutiveDays ?? ''} onChange={num('maxConsecutiveDays')} placeholder="No limit" className={INPUT_CLASS} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {toggle('paid', 'Paid leave', 'Unpaid leave reduces salary')}
          {toggle('requiresBalance', 'Needs a balance to apply')}
          {toggle('allowHalfDay', 'Half days allowed')}
          {toggle('encashable', 'Encash days above the carry-forward limit', 'Otherwise they lapse at year end')}
          {toggle('sandwich', 'Sandwich rule', 'Weekly-offs and holidays between leave days count as leave')}
          {toggle('applicableDuringProbation', 'Available during probation')}
          {!isNew && toggle('active', 'Active')}
        </div>
        {error && <div role="alert" className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">{error}</div>}
      </form>
    </Modal>
  );
};
