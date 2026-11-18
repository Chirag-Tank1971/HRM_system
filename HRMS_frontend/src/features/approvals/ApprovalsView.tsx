import React, { useCallback, useEffect, useState } from 'react';
import { Check, CheckCheck, Inbox, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TEXTAREA_CLASS } from '../../components/ui/formStyles';
import { toast } from '../../context/ToastContext';
import { hrApi, type ApprovalItem } from '../../services/hrApi';

type Tab = 'pending' | 'mine' | 'history';

const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg';

const REQUEST_LABEL: Record<string, string> = {
  LEAVE: 'Leave',
  ATTENDANCE_REGULARISATION: 'Attendance correction',
  PROFILE_CHANGE: 'Profile change',
};

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'default' } as const;
const STATUS_LABEL = { PENDING: 'Awaiting approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Withdrawn' } as const;

const TIME_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const formatTime = (iso?: string) => (iso ? TIME_FMT.format(new Date(iso)) : '');

interface ApprovalsViewProps {
  /** Called after a decision, so the nav badge can refresh. */
  onChanged?: () => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ onChanged }) => {
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; comment: string } | null>(null);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    hrApi
      .getApprovals(tab)
      .then(setItems)
      .catch((err) => toast.error(err.message || 'Could not load approvals.', 'Load failed'))
      .finally(() => setIsLoading(false));
  }, [tab]);

  useEffect(load, [load]);

  const decide = async (item: ApprovalItem, decision: 'approve' | 'reject', comment?: string) => {
    setBusyId(item.id);
    try {
      await hrApi.decideApproval(item.id, decision, comment);
      toast.success(`${item.requesterName}'s request was ${decision === 'approve' ? 'approved' : 'rejected'}.`, decision === 'approve' ? 'Approved' : 'Rejected');
      setRejecting(null);
      setItems((list) => list.filter((x) => x.id !== item.id));
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not record your decision.', 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    setIsBulkBusy(true);
    try {
      const result = await hrApi.bulkApprove(items.map((i) => i.id));
      toast.success(`${result.succeeded} approved${result.failed ? `, ${result.failed} could not be approved` : ''}.`, 'Approved');
      load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not approve the requests.', 'Failed');
    } finally {
      setIsBulkBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Requests waiting for your decision, and the status of requests you raised."
        actions={
          <>
            <SegmentedControl
              ariaLabel="Approval lists"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'pending', label: 'To decide' },
                { value: 'mine', label: 'My requests' },
                { value: 'history', label: 'Decided by me' },
              ]}
            />
            {tab === 'pending' && items.length > 1 && (
              <Button icon={CheckCheck} onClick={() => void approveAll()} disabled={isBulkBusy}>
                {isBulkBusy ? 'Approving…' : `Approve all ${items.length}`}
              </Button>
            )}
            <Button variant="ghost" icon={RefreshCw} iconSpin={isLoading} aria-label="Refresh" onClick={load} />
          </>
        }
      />

      {isLoading && items.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={CARD}>
          {tab === 'pending' ? (
            <EmptyState icon={Inbox} tone="success" title="You're all caught up" description="Nothing is waiting for your approval." />
          ) : (
            <EmptyState icon={Inbox} title={tab === 'mine' ? 'No requests raised yet' : 'No decisions yet'} description={tab === 'mine' ? 'Requests you raise, such as leave, show here with their status.' : 'Requests you approve or reject are listed here.'} />
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const isRejecting = rejecting?.id === item.id;
            const isBusy = busyId === item.id;
            return (
              <li key={item.id} className={`${CARD} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={REQUEST_LABEL[item.requestType] || item.requestType} tone="primary" size="sm" />
                      {tab !== 'pending' && <StatusBadge status={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} size="sm" />}
                    </div>
                    <h2 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {tab === 'mine' ? item.title : `${item.requesterName} · ${item.title}`}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 break-words">{item.summary}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Raised {formatTime(item.createdAt)}</p>
                  </div>

                  {tab === 'pending' && !isRejecting && (
                    <div className="flex gap-2 shrink-0">
                      <Button icon={X} onClick={() => setRejecting({ id: item.id, comment: '' })} disabled={isBusy}>Reject</Button>
                      <Button variant="primary" icon={Check} onClick={() => void decide(item, 'approve')} disabled={isBusy}>
                        {isBusy ? 'Saving…' : 'Approve'}
                      </Button>
                    </div>
                  )}
                </div>

                {isRejecting && (
                  <div className="mt-3 space-y-2">
                    <label htmlFor={`reject-${item.id}`} className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                      Reason for rejecting (shown to {item.requesterName})
                    </label>
                    <textarea
                      id={`reject-${item.id}`}
                      autoFocus
                      rows={2}
                      maxLength={1000}
                      value={rejecting.comment}
                      onChange={(e) => setRejecting({ id: item.id, comment: e.target.value })}
                      className={TEXTAREA_CLASS}
                    />
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setRejecting(null)} disabled={isBusy}>Back</Button>
                      <Button variant="primary" onClick={() => void decide(item, 'reject', rejecting.comment)} disabled={isBusy || !rejecting.comment.trim()}>
                        {isBusy ? 'Saving…' : 'Reject request'}
                      </Button>
                    </div>
                  </div>
                )}

                {(tab !== 'pending' || item.steps.length > 1) && (
                  <ol className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    {item.steps.map((step) => (
                      <li key={step.order} className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-slate-800 dark:text-slate-200">Step {step.order + 1}</span>
                        {step.status === 'APPROVED' || step.status === 'REJECTED' ? (
                          <span>
                            {step.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {step.actedByName}
                            {step.override ? ' (on behalf of the approver)' : ''}, {formatTime(step.actedAt)}
                            {step.comment ? `: “${step.comment}”` : ''}
                          </span>
                        ) : step.status === 'PENDING' ? (
                          <span>Waiting for {step.approverNames.join(' or ') || 'an approver'}</span>
                        ) : step.status === 'WAITING' ? (
                          <span>Then {step.approverNames.join(' or ') || 'the next approver'}</span>
                        ) : (
                          <span>Not needed</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
