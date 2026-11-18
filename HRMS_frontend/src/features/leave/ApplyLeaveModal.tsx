import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { INPUT_CLASS, LABEL_CLASS } from '../../components/ui/formStyles';
import { toast } from '../../context/ToastContext';
import {
  hrApi,
  formatDay,
  formatDays,
  todayIso,
  type LeaveBalance,
  type LeavePreview,
  type LeaveType,
} from '../../services/hrApi';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
  leaveTypes: LeaveType[];
  balances: LeaveBalance[];
  /** HR applying on someone's behalf. */
  onBehalfOf?: { id: string; name: string };
}

const KIND_LABEL: Record<string, string> = {
  LEAVE: 'Leave',
  HALF: 'Half day',
  WEEKLY_OFF: 'Weekly off',
  HOLIDAY: 'Holiday',
  SANDWICH: 'Counted (between leave days)',
};

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({ isOpen, onClose, onApplied, leaveTypes, balances, onBehalfOf }) => {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [startHalf, setStartHalf] = useState(false);
  const [endHalf, setEndHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Start clean each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setLeaveTypeId(leaveTypes[0]?.id || '');
    setFromDate(todayIso());
    setToDate(todayIso());
    setStartHalf(false);
    setEndHalf(false);
    setReason('');
    setPreview(null);
    setSubmitError(null);
  }, [isOpen, leaveTypes]);

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId);
  const application = useMemo(
    () => ({ leaveTypeId, fromDate, toDate, startHalf, endHalf, ...(onBehalfOf ? { employeeId: onBehalfOf.id } : {}) }),
    [leaveTypeId, fromDate, toDate, startHalf, endHalf, onBehalfOf]
  );

  // Ask the server how many days this is and whether it can be applied; debounced while typing.
  useEffect(() => {
    if (!isOpen || !leaveTypeId || !fromDate || !toDate) return;
    let cancelled = false;
    setIsChecking(true);
    const timer = setTimeout(() => {
      hrApi
        .previewLeave(application)
        .then((p) => !cancelled && setPreview(p))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setIsChecking(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, application, leaveTypeId, fromDate, toDate]);

  const handleFromChange = (value: string) => {
    setFromDate(value);
    if (value > toDate) setToDate(value);
  };

  const canSubmit = !!preview && preview.errors.length === 0 && preview.days > 0 && reason.trim().length >= 3 && !isChecking;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await hrApi.applyLeave({ ...application, reason: reason.trim() });
      toast.success(`${selectedType?.name || 'Leave'} sent for approval.`, 'Leave applied');
      onApplied();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Could not apply for leave.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const balance = balances.find((b) => b.leaveTypeId === leaveTypeId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={onBehalfOf ? `Apply leave for ${onBehalfOf.name}` : 'Apply for leave'}
      description="Your request goes to your reporting manager for approval."
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" type="submit" form="apply-leave-form" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Sending…' : preview && preview.days > 0 ? `Apply for ${formatDays(preview.days)}` : 'Apply'}
          </Button>
        </>
      }
    >
      <form id="apply-leave-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="leave-type" className={LABEL_CLASS}>Leave type</label>
          <select id="leave-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className={INPUT_CLASS}>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</option>
            ))}
          </select>
          {balance && selectedType?.requiresBalance && !onBehalfOf && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {balance.available} day{balance.available === 1 ? '' : 's'} available
              {balance.pending > 0 && ` (${balance.pending} awaiting approval)`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="leave-from" className={LABEL_CLASS}>From</label>
            <input id="leave-from" type="date" required value={fromDate} onChange={(e) => handleFromChange(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="leave-to" className={LABEL_CLASS}>To</label>
            <input id="leave-to" type="date" required min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        {selectedType?.allowHalfDay && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-800 dark:text-slate-200">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={startHalf} onChange={(e) => setStartHalf(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              Start after the first half
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={endHalf} onChange={(e) => setEndHalf(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              End after the first half
            </label>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="leave-reason" className={LABEL_CLASS}>Reason</label>
          <textarea
            id="leave-reason"
            required
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A short note for your approver"
            className={INPUT_CLASS}
          />
        </div>

        {preview && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              {preview.days > 0 ? `${formatDays(preview.days)} of leave` : 'No leave days in these dates'}
            </div>
            {preview.breakdown.length > 1 && preview.breakdown.length <= 14 && (
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                {preview.breakdown.map((d) => (
                  <li key={d.date} className="flex justify-between gap-3">
                    <span>{formatDay(d.date)}</span>
                    <span className={d.kind === 'LEAVE' || d.kind === 'HALF' || d.kind === 'SANDWICH' ? 'text-slate-900 dark:text-slate-200' : ''}>
                      {d.kind === 'HOLIDAY' && d.label ? d.label : KIND_LABEL[d.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(submitError || (preview && preview.errors.length > 0)) && (
          <div role="alert" className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 space-y-1">
            {[...(preview?.errors || []), ...(submitError ? [submitError] : [])].map((msg) => (
              <div key={msg} className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{msg}</span>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
};
