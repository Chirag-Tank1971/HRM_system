import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { Appraisal, DashboardSummary, DashboardTaskLink } from '../../types';
import { api } from '../../services/api';
import { getDashboardInsights, type DashboardInsights } from '../../services/hrApi';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../context/ToastContext';
import { EmptyState } from '../ui/EmptyState';
import { PageSkeletonLoader } from '../ui/PageSkeletonLoader';
import { AppraisalLetterModal } from '../AppraisalLetterModal';
import { AdminDashboard, EmployeeDashboard, HodDashboard, HrDashboard, ManagerDashboard } from './RoleDashboards';
import { daysUntil, greeting } from './format';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import {
  LeaveSection,
  MyLeaveCard,
  SectionHeading,
  TeamSnapshot,
  TodayStrip,
  UpcomingCard,
  WorkforceSection,
  type CycleInfo,
} from '../../features/dashboard/sections';

type Lens = 'admin' | 'hr' | 'hod' | 'team' | 'me';

const LENS_CTA: Partial<Record<Lens, { label: string; view: DashboardTaskLink['view'] }>> = {
  admin: { label: 'Manage directory', view: 'employees' },
  hr: { label: 'Review cycle', view: 'reviews' },
  hod: { label: 'HOD reviews', view: 'reviews' },
  team: { label: 'Score team reviews', view: 'reviews' },
};

const TODAY_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

interface DashboardViewProps {
  onNavigate: (view: DashboardTaskLink['view'], params?: DashboardTaskLink['params']) => void;
  initialConfig?: { openLetter?: boolean } | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, initialConfig }) => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens | null>(null);
  const [selectedAppraisalForLetter, setSelectedAppraisalForLetter] = useState<Appraisal | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // The review summary is required; workforce and leave figures are a bonus that must not
    // block the page if they fail.
    const [summary, extra] = await Promise.allSettled([api.getDashboardSummary(), getDashboardInsights()]);
    if (summary.status === 'fulfilled') setData(summary.value);
    else setError((summary.reason as Error)?.message || 'Failed to load dashboard.');
    if (extra.status === 'fulfilled') setInsights(extra.value);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, user?.id, user?.role]);

  const handleOpenLetter = useCallback(async () => {
    const appraisalId = data?.me?.activeAppraisal?.id;
    if (!appraisalId) {
      toast.info('No active annual appraisal found for your account.');
      return;
    }
    try {
      const appraisal = await api.getAppraisal(appraisalId);
      if (appraisal) setSelectedAppraisalForLetter(appraisal);
      else toast.error('Could not load appraisal letter details.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to open appraisal letter.');
    }
  }, [data?.me?.activeAppraisal?.id]);

  useEffect(() => {
    if (initialConfig?.openLetter && data?.me?.activeAppraisal?.id) {
      handleOpenLetter();
    }
  }, [initialConfig, data?.me?.activeAppraisal?.id, handleOpenLetter]);

  if (isLoading && !data) return <PageSkeletonLoader variant="generic" />;

  if (error && !data) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load your dashboard"
        description={error}
        action={{ label: 'Try again', onClick: load, icon: RefreshCw }}
      />
    );
  }

  if (!data) return null;

  const hasAdmin = Boolean(data.admin);
  const hasHr = Boolean(data.hr);
  const hasHod = Boolean(data.hod);
  const hasTeam = Boolean(data.team);
  const hasMe = Boolean(data.me);

  // Default lens: the viewer's primary role, falling back to whatever data they have.
  const defaultLens: Lens =
    (user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGEMENT') && hasAdmin
      ? 'admin'
      : hasHr && user?.role === 'HR'
      ? 'hr'
      : hasHod
      ? 'hod'
      : hasAdmin
      ? 'admin'
      : hasHr
      ? 'hr'
      : hasTeam
      ? 'team'
      : 'me';
  const activeLens: Lens = lens || defaultLens;

  const availableLenses: { key: Lens; label: string }[] = [];
  if (hasAdmin) availableLenses.push({ key: 'admin', label: 'Organisation' });
  if (hasHr) availableLenses.push({ key: 'hr', label: 'HR' });
  if (hasHod) availableLenses.push({ key: 'hod', label: 'Department' });
  if (hasTeam) availableLenses.push({ key: 'team', label: 'My team' });
  if (hasMe) availableLenses.push({ key: 'me', label: 'My work' });

  const firstName = (data.me?.employee.name || user?.name || '').split(' ')[0];
  const scopeLine =
    activeLens === 'hod' && data.hod
      ? data.hod.departmentName
      : [data.me?.employee.designationName, data.me?.employee.departmentName].filter(Boolean).join(' · ');

  // Review cycle progress for the viewer's own scope, shown once, in the Today strip.
  const cycle: CycleInfo | null = data.period
    ? {
        name: data.period.name,
        daysLeft: data.period.dueDate ? daysUntil(data.period.dueDate) : undefined,
        ...(activeLens === 'admin' || activeLens === 'hr'
          ? data.hr
            ? { percent: data.hr.completionRate, percentLabel: 'complete' }
            : {}
          : activeLens === 'hod' && data.hod
          ? { percent: data.hod.completionRate, percentLabel: 'of department done' }
          : activeLens === 'team' && data.team && data.team.reviewsInPeriod > 0
          ? { percent: (data.team.scoredByManager / data.team.reviewsInPeriod) * 100, percentLabel: 'of your reviews submitted' }
          : {}),
      }
    : null;

  const cta = LENS_CTA[activeLens];

  // Live workforce and leave figures, placed between the role's actions and its review details.
  const orgMiddle = insights && (
    <>
      <WorkforceSection insights={insights} onNavigate={onNavigate} />
      <LeaveSection insights={insights} onNavigate={onNavigate} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <UpcomingCard insights={insights} onNavigate={onNavigate} className={insights.myLeave ? 'lg:col-span-2' : 'lg:col-span-3'} />
        <MyLeaveCard insights={insights} onNavigate={onNavigate} />
      </div>
      <SectionHeading title="Reviews and performance" />
    </>
  );
  const departmentMiddle = insights && (
    <>
      <WorkforceSection insights={insights} onNavigate={onNavigate} compact />
      <LeaveSection insights={insights} onNavigate={onNavigate} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <UpcomingCard insights={insights} onNavigate={onNavigate} className={insights.myLeave ? 'lg:col-span-2' : 'lg:col-span-3'} />
        <MyLeaveCard insights={insights} onNavigate={onNavigate} />
      </div>
      <SectionHeading title="Department reviews" />
    </>
  );
  const teamMiddle = insights && (
    <>
      <TeamSnapshot insights={insights} onNavigate={onNavigate} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <UpcomingCard insights={insights} onNavigate={onNavigate} className={insights.myLeave ? 'lg:col-span-2' : 'lg:col-span-3'} />
        <MyLeaveCard insights={insights} onNavigate={onNavigate} />
      </div>
      <SectionHeading title="Team reviews" />
    </>
  );
  const myMiddle = insights && (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
      <MyLeaveCard insights={insights} onNavigate={onNavigate} />
      <UpcomingCard insights={insights} onNavigate={onNavigate} className="lg:col-span-2" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-[1400px]">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={[TODAY_FMT.format(new Date()), scopeLine].filter(Boolean).join(' · ')}
        actions={
          <>
            {availableLenses.length > 1 && (
              <SegmentedControl
                ariaLabel="Dashboard view"
                value={activeLens}
                onChange={setLens}
                options={availableLenses.map((l) => ({ value: l.key, label: l.label }))}
              />
            )}
            <Button variant="ghost" icon={RefreshCw} iconSpin={isLoading} onClick={load} disabled={isLoading} title="Refresh" aria-label="Refresh dashboard" />
            {cta && (
              <Button variant="primary" onClick={() => onNavigate(cta.view)}>
                {cta.label}
              </Button>
            )}
          </>
        }
      />

      <TodayStrip insights={insights} cycle={cycle} onNavigate={onNavigate} />

      {activeLens === 'admin' && data.admin ? (
        <AdminDashboard data={data} admin={data.admin} onNavigate={onNavigate} middle={orgMiddle} />
      ) : activeLens === 'hr' && data.hr ? (
        <HrDashboard data={data} hr={data.hr} onNavigate={onNavigate} onRefresh={load} middle={orgMiddle} />
      ) : activeLens === 'hod' && data.hod ? (
        <HodDashboard data={data} hod={data.hod} onNavigate={onNavigate} middle={departmentMiddle} />
      ) : activeLens === 'team' && data.team ? (
        <ManagerDashboard data={data} team={data.team} onNavigate={onNavigate} middle={teamMiddle} />
      ) : data.me ? (
        <EmployeeDashboard data={data} me={data.me} onNavigate={onNavigate} onOpenLetter={handleOpenLetter} middle={myMiddle} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your account isn't linked to an employee record, so there is no personal review to show.
        </p>
      )}

      {selectedAppraisalForLetter && (
        <AppraisalLetterModal
          appraisal={selectedAppraisalForLetter}
          onClose={() => {
            setSelectedAppraisalForLetter(null);
            load();
          }}
        />
      )}
    </div>
  );
};
