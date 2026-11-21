import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, Users } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { INPUT_CLASS, LABEL_CLASS } from '../../components/ui/formStyles';
import { toast } from '../../context/ToastContext';
import { hrApi, formatDays, type DistributionResult, type EmployeeLite, type LeaveType } from '../../services/hrApi';

type Scope = 'ALL' | 'DEPARTMENTS' | 'EMPLOYEES';

interface DistributeLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDistributed: () => void;
  leaveTypes: LeaveType[];
  employees: EmployeeLite[];
}

const CHECKBOX = 'rounded border-slate-300 text-indigo-600 focus:ring-indigo-500';

/** HR / admin: grant days of one leave type to everyone, to departments, or to chosen people. */
export const DistributeLeaveModal: React.FC<DistributeLeaveModalProps> = ({ isOpen, onClose, onDistributed, leaveTypes, employees }) => {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [scope, setScope] = useState<Scope>('ALL');
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<DistributionResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const active = useMemo(
    () => employees.filter((e) => e.status !== 'INACTIVE' && !e.isPastEmployee).sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );
  const departments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const e of active) {
      if (!e.departmentId) continue;
      const d = map.get(e.departmentId) || { id: e.departmentId, name: e.departmentName || e.departmentId, count: 0 };
      d.count += 1;
      map.set(e.departmentId, d);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [active]);

  useEffect(() => {
    if (!isOpen) return;
    setLeaveTypeId(leaveTypes[0]?.id || '');
    setQuantity('1');
    setScope('ALL');
    setDepartmentIds([]);
    setEmployeeIds([]);
    setSearch('');
    setNote('');
    setPreview(null);
    setPreviewError(null);
  }, [isOpen, leaveTypes]);

  const qty = Number(quantity);
  const hasSelection = scope === 'ALL' || (scope === 'DEPARTMENTS' ? departmentIds.length > 0 : employeeIds.length > 0);
  const request = useMemo(
    () => ({ leaveTypeId, quantity: qty, scope, departmentIds, employeeIds }),
    [leaveTypeId, qty, scope, departmentIds, employeeIds]
  );

  // Ask the server who would receive this, so HR sees the exact list before crediting.
  useEffect(() => {
    if (!isOpen || !leaveTypeId || !hasSelection || !(qty > 0)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setIsChecking(true);
    const timer = setTimeout(() => {
      hrApi
        .distributeLeave({ ...request, note: '', preview: true })
        .then((r) => {
          if (cancelled) return;
          setPreview(r);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err.message || 'Could not check this distribution.');
        })
        .finally(() => !cancelled && setIsChecking(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, request, leaveTypeId, hasSelection, qty]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const filtered = active.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q);
  });

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId);
  const canSubmit = !!preview && preview.recipients.length > 0 && note.trim().length >= 3 && !isChecking && !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    try {
      const result = await hrApi.distributeLeave({ ...request, note: note.trim() });
      toast.success(`${formatDays(qty)} of ${selectedType?.name} credited to ${result.credited} employee${result.credited === 1 ? '' : 's'}.`, 'Leave distributed');
      onDistributed();
      onClose();
    } catch (err: any) {
      setPreviewError(err.message || 'Could not distribute leave.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Distribute leave"
      description="Credit the same number of days to a group of employees. Each credit is recorded in their leave ledger."
      footer={
        <>
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" type="submit" form="distribute-leave-form" disabled={!canSubmit}>
            {isSaving ? 'Crediting…' : preview?.recipients.length ? `Credit ${preview.recipients.length} employee${preview.recipients.length === 1 ? '' : 's'}` : 'Distribute'}
          </Button>
        </>
      }
    >
      <form id="distribute-leave-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="dist-type" className={LABEL_CLASS}>Leave type</label>
            <select id="dist-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className={INPUT_CLASS}>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="dist-qty" className={LABEL_CLASS}>Days each</label>
            <input id="dist-qty" type="number" min={0.5} max={365} step={0.5} required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        <div className="space-y-2">
          <span className={LABEL_CLASS}>Give it to</span>
          <SegmentedControl
            ariaLabel="Who receives the leave"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'ALL', label: 'Everyone' },
              { value: 'DEPARTMENTS', label: 'Departments' },
              { value: 'EMPLOYEES', label: 'Selected employees' },
            ]}
          />

          {scope === 'DEPARTMENTS' && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {departments.length === 0 && <p className="p-3 text-sm text-slate-500 dark:text-slate-400">No departments found.</p>}
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <input type="checkbox" className={CHECKBOX} checked={departmentIds.includes(d.id)} onChange={() => toggle(departmentIds, setDepartmentIds, d.id)} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{d.count}</span>
                </label>
              ))}
            </div>
          )}

          {scope === 'EMPLOYEES' && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search employees"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or employee code"
                  className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{employeeIds.length} selected</span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 && <p className="p-3 text-sm text-slate-500 dark:text-slate-400">No employees match.</p>}
                {filtered.map((e) => (
                  <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <input type="checkbox" className={CHECKBOX} checked={employeeIds.includes(e.id)} onChange={() => toggle(employeeIds, setEmployeeIds, e.id)} />
                    <span className="flex-1 truncate">{e.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{e.employeeCode}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="dist-note" className={LABEL_CLASS}>Reason</label>
          <input id="dist-note" type="text" required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Annual entitlement for 2027" className={INPUT_CLASS} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Employees see this reason against the credit in their leave history.</p>
        </div>

        {preview && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              {preview.recipients.length === 0
                ? 'Nobody in this selection qualifies'
                : `${preview.recipients.length} employee${preview.recipients.length === 1 ? '' : 's'} will each get ${formatDays(qty)} (${formatDays(preview.totalDays)} in total)`}
            </div>
            {preview.recipients.length > 0 && preview.recipients.length <= 8 && (
              <p className="text-xs text-slate-600 dark:text-slate-400">{preview.recipients.map((r) => r.name).join(', ')}</p>
            )}
            {preview.skipped.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Left out: {preview.skipped.slice(0, 5).map((s) => `${s.name} (${s.reason.toLowerCase()})`).join('; ')}
                {preview.skipped.length > 5 && ` and ${preview.skipped.length - 5} more`}
              </p>
            )}
          </div>
        )}

        {previewError && (
          <div role="alert" className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{previewError}</span>
          </div>
        )}
      </form>
    </Modal>
  );
};
