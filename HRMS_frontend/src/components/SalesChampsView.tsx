import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target, Plus, Search, RefreshCw, Lock, CheckCircle2,
  Download, Printer, Pencil, Loader2, Trash2, AlertTriangle, FilePen, ChevronRight,
} from 'lucide-react';
import { Employee, Department } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { toast } from '../context/ToastContext';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { SegmentedControl } from './ui/SegmentedControl';
import { useCompanyName } from '../hooks/useCompanyName';
import { SELECT_CLASS } from './ui/formStyles';
import { SalesChampsReportModal, SalesChampsReport } from './SalesChampsReportModal';
import { downloadChampsPdf, printChampsReport, champsTermsHtml, ChampsReportData } from '../utils/salesChampsExport';
import { cn } from '../utils/cn';

interface Props {
  employees: Employee[];
  departments?: Department[];
}

type FilterStatus = 'ALL' | 'DRAFT' | 'FINAL' | 'LOCKED';

const STATUS_TONE = {
  DRAFT: { label: 'Draft', tone: 'warning' },
  FINAL: { label: 'Final', tone: 'info' },
  LOCKED: { label: 'Locked', tone: 'success' },
} as const;

function toChampsData(r: SalesChampsReport, companyName: string): ChampsReportData {
  return {
    companyName,
    employeeName: r.employeeName,
    financialYear: r.financialYear,
    fyDateRange: r.fyDateRange,
    publishedDate: r.publishedDate,
    gm2TargetCr: r.gm2TargetCr,
    slabs: r.slabs,
    mintValue: r.mintValue,
    incentiveSchemeName: r.incentiveSchemeName,
    rules: r.rules,
    customRuleText: r.customRuleText,
  };
}

const NEXT_STEP: Record<string, string> = {
  DRAFT: 'Next: HR checks it and marks it Final.',
  FINAL: 'Next: a Super Admin locks it, which shares it with the salesperson.',
  LOCKED: 'Shared with the salesperson. A locked plan can no longer be changed.',
};

/** A short summary of a plan (target and incentives), shown when its row is opened. */
const PlanDetails: React.FC<{ report: SalesChampsReport }> = ({ report: r }) => {
  const num = (v: unknown) => Number(v) || 0;
  // Tiers left all zero in the form are not shown
  const tiers = (r.slabs || [])
    .map((sl, i) => ({ ...sl, n: i + 1 }))
    .filter((sl) => num(sl.amcTargetLacs) || num(sl.amcIncentiveLacs) || num(sl.gm2AchievementLacs) || num(sl.salesIncentiveLacs));
  const topIncentive = tiers.reduce((m, t) => Math.max(m, num(t.salesIncentiveLacs)), 0);

  const facts: [string, React.ReactNode][] = [
    ['GM2 target', <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">₹{r.gm2TargetCr}</span>],
    ['Top sales incentive', <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">{topIncentive ? `₹${topIncentive.toFixed(2)} L` : '—'}</span>],
    ['Period', r.fyDateRange || r.financialYear],
    ...(r.incentiveSchemeName ? [['Plan subtitle', r.incentiveSchemeName] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="px-4 sm:px-6 py-4 bg-slate-50/70 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800 space-y-4">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-xs text-slate-800 dark:text-slate-200 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {tiers.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Tier</th>
                <th className="py-2 px-3 text-right font-medium">GM2 to achieve (L)</th>
                <th className="py-2 px-3 text-right font-medium">Sales incentive (L)</th>
                <th className="py-2 px-3 text-right font-medium">AMC target (L)</th>
                <th className="py-2 px-3 text-right font-medium">AMC incentive (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {tiers.map((t) => (
                <tr key={t.n}>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">Tier {t.n}</td>
                  <td className="py-2 px-3 text-right">{num(t.gm2AchievementLacs)}</td>
                  <td className="py-2 px-3 text-right font-semibold">{num(t.salesIncentiveLacs).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">{num(t.amcTargetLacs)}</td>
                  <td className="py-2 px-3 text-right">{num(t.amcIncentiveLacs).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">No incentive tiers added yet.</p>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400">{NEXT_STEP[r.status || 'DRAFT']} Print or download for the full plan with terms.</p>
    </div>
  );
};

type PendingConfirm = { kind: 'lock' | 'delete'; report: SalesChampsReport } | null;

export const SalesChampsView: React.FC<Props> = ({ employees, departments }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isHR = user?.role === 'HR';
  const isManagementOrAdmin = isAdmin || isHR;
  const companyName = useCompanyName();

  const [reports, setReports] = useState<SalesChampsReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [fyFilter, setFyFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<SalesChampsReport | null>(null);

  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isManagementOrAdmin) {
        // Year and status are filtered client-side: the counts and year list stay complete, and the
        // create form can see every existing report to block duplicates
        const data = await api.getSalesChampsReports();
        setReports(data || []);
      } else if (user?.employeeId) {
        const data = await api.getMySalesChampsReports(user.employeeId);
        setReports(data || []);
      } else {
        setReports([]);
      }
      setSelectedIdx(0);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load sales achievement plans.');
    } finally {
      setIsLoading(false);
    }
  }, [isManagementOrAdmin, user?.employeeId]);

  useEffect(() => { load(); }, [load]);

  const fyOptions = useMemo(() => {
    const years = Array.from(new Set(reports.map((r) => r.financialYear).filter(Boolean)));
    return years.sort();
  }, [reports]);

  const yearReports = fyFilter ? reports.filter((r) => r.financialYear === fyFilter) : reports;
  const filtered = yearReports.filter((r) => {
    if (statusFilter !== 'ALL' && (r.status || 'DRAFT') !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || r.employeeName.toLowerCase().includes(q) || r.financialYear.toLowerCase().includes(q);
  });

  const handleCreate = async (data: Omit<SalesChampsReport, 'id' | 'status'>) => {
    try {
      if (editingReport?.id) {
        const wasFinal = editingReport.status === 'FINAL';
        await api.updateSalesChampsReport(editingReport.id, data);
        toast.success(wasFinal ? 'Plan updated and moved back to Draft for review.' : 'Plan updated.');
      } else {
        await api.createSalesChampsReport(data);
        toast.success('Plan created as a draft.');
      }
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save the plan.');
      throw err;
    }
  };

  const runAction = async (id: string, kind: string, fn: () => Promise<unknown>, success: string) => {
    setActionLoading((p) => ({ ...p, [id]: kind }));
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (err: any) {
      toast.error(err?.message || `Failed to ${kind} the plan.`);
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  const handleFinalize = (id: string) =>
    runAction(id, 'finalize', () => api.finalizeSalesChampsReport(id), 'Plan marked as Final. A Super Admin can now lock it.');

  const handleConfirmed = async () => {
    if (!pendingConfirm?.report.id) return;
    const { kind, report } = pendingConfirm;
    const id = report.id!;
    setPendingConfirm(null);
    if (kind === 'lock') {
      await runAction(id, 'lock', () => api.lockSalesChampsReport(id), `Plan locked. ${report.employeeName} has been notified.`);
    } else {
      await runAction(id, 'delete', () => api.deleteSalesChampsReport(id), 'Plan deleted.');
    }
  };

  const handleDownloadPdf = async (r: SalesChampsReport) => {
    setPdfLoading(r.id!);
    try {
      await downloadChampsPdf(toChampsData(r, companyName));
    } finally {
      setPdfLoading(null);
    }
  };

  if (!isManagementOrAdmin) {
    const activeReport = reports[selectedIdx] || reports[0];
    const isPdfDl = activeReport?.id ? pdfLoading === activeReport.id : false;
    const terms = activeReport ? champsTermsHtml(activeReport) : { left: [], right: [] };

    return (
      <div className="space-y-6">
        <PageHeader
          title="My sales achievement plan"
          description="Your approved annual target, incentive tiers and terms."
          actions={
            activeReport ? (
              <>
                <Button icon={Printer} onClick={() => printChampsReport(toChampsData(activeReport, companyName))}>
                  Print
                </Button>
                <Button
                  variant="primary"
                  icon={isPdfDl ? Loader2 : Download}
                  iconSpin={isPdfDl}
                  disabled={isPdfDl}
                  onClick={() => handleDownloadPdf(activeReport)}
                >
                  Download PDF
                </Button>
              </>
            ) : undefined
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-500 dark:text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your plan…
          </div>
        ) : !activeReport ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center max-w-lg mx-auto">
            <Target className="w-8 h-8 mx-auto mb-3 text-slate-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No plan shared with you yet</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Your sales target and incentive plan will appear here once HR has prepared it and it has been approved and locked.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-5xl mx-auto">
            {reports.length > 1 && (
              <SegmentedControl
                ariaLabel="Financial year"
                options={reports.map((r, i) => ({ value: String(i), label: r.financialYear }))}
                value={String(selectedIdx)}
                onChange={(v) => setSelectedIdx(Number(v))}
              />
            )}

            {/* Same layout as the printed plan */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              <div className="bg-indigo-950 text-white px-6 py-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  {companyName && <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-200">{companyName}</div>}
                  <div className="text-xl font-semibold tracking-tight mt-0.5">Sales achievement plan {activeReport.financialYear}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold">{activeReport.employeeName}</div>
                  <div className="text-xs text-indigo-200 mt-0.5 flex items-center justify-end gap-2 flex-wrap">
                    {activeReport.fyDateRange && <span>Period {activeReport.fyDateRange}</span>}
                    {activeReport.publishedDate && <span>Published {activeReport.publishedDate}</span>}
                    <span className="inline-flex items-center gap-1 bg-white/10 border border-white/20 text-[11px] font-medium px-2 py-0.5 rounded-md">
                      <Lock className="w-3 h-3" aria-hidden="true" /> Approved
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-1 bg-[#eb6834]" aria-hidden="true" />

              <div className="p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-850 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Individual target (GM2 margin)</span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Annual GM2 contribution to be achieved for {activeReport.financialYear}
                    </p>
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">₹{activeReport.gm2TargetCr}</div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Incentive tiers{activeReport.incentiveSchemeName ? ` · ${activeReport.incentiveSchemeName}` : ''}
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs tabular-nums">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="py-2.5 px-3 text-left font-medium">Tier</th>
                          <th className="py-2.5 px-3 text-right font-medium">Total AMC target (Lacs)</th>
                          <th className="py-2.5 px-3 text-right font-medium">Incentive for AMC (Lacs)</th>
                          <th className="py-2.5 px-3 text-right font-medium">GM2 contribution achieved (Lacs)</th>
                          <th className="py-2.5 px-3 text-right font-medium">Total sales incentive (Lacs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                        {activeReport.slabs?.map((s, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">Tier {idx + 1}</td>
                            <td className="py-2.5 px-3 text-right">{s.amcTargetLacs}</td>
                            <td className="py-2.5 px-3 text-right">{(Number(s.amcIncentiveLacs) || 0).toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right">{s.gm2AchievementLacs}</td>
                            <td className="py-2.5 px-3 text-right font-semibold">{(Number(s.salesIncentiveLacs) || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-850 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Terms &amp; conditions</h4>
                  {/* Same HR-selected terms as the PDF; fixed strings plus escaped custom text */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
                    <ul className="space-y-2 list-disc pl-4 [&_ul]:list-[circle] [&_ul]:text-slate-600 dark:[&_ul]:text-slate-400" dangerouslySetInnerHTML={{ __html: terms.left.join('') }} />
                    <ul className="space-y-2 list-disc pl-4" dangerouslySetInnerHTML={{ __html: terms.right.join('') }} />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{companyName ? `${companyName} · ` : ''}Internal and confidential</span>
                {activeReport.mintValue && <span>{activeReport.mintValue}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const countFor = (s: FilterStatus) => (s === 'ALL' ? yearReports.length : yearReports.filter((r) => (r.status || 'DRAFT') === s).length);

  const openNew = () => { setEditingReport(null); setIsModalOpen(true); };

  const STATUS_TILES: { key: FilterStatus; label: string; help: string; icon: typeof Target }[] = [
    { key: 'ALL', label: 'All plans', help: fyFilter || 'Every year', icon: Target },
    { key: 'DRAFT', label: 'Draft', help: 'Being prepared by HR', icon: FilePen },
    { key: 'FINAL', label: 'Final', help: isAdmin ? 'Waiting for you to lock' : 'Waiting for Super Admin', icon: CheckCircle2 },
    { key: 'LOCKED', label: 'Locked', help: 'Shared with the employee', icon: Lock },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales achievement"
        description="Annual sales targets and incentive plans. HR drafts and finalises a plan, a Super Admin locks it, and the salesperson can then view and download it."
        actions={
          <Button variant="primary" size="md" icon={Plus} onClick={openNew}>
            New plan
          </Button>
        }
      />

      {/* Status summary: each tile filters the table */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUS_TILES.map(({ key, label, help, icon: Icon }) => {
          const active = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(key)}
              className={cn(
                'text-left rounded-xl border p-4 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                active
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 dark:border-indigo-500'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
                <Icon className={cn('w-4 h-4', active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} aria-hidden="true" />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                {isLoading ? '–' : countFor(key)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{help}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or year…"
            aria-label="Search plans"
            className="w-full h-8 pl-8 pr-3 text-xs border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
          />
        </div>

        {fyOptions.length > 0 && (
          <select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} aria-label="Financial year" className={SELECT_CLASS}>
            <option value="">All years</option>
            {fyOptions.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        )}

        <Button variant="ghost" icon={RefreshCw} iconSpin={isLoading} onClick={load} aria-label="Refresh" />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 dark:text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans…
          </div>
        ) : filtered.length === 0 ? (
          reports.length === 0 ? (
            <div className="px-6 py-14 max-w-2xl mx-auto text-center">
              <Target className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No sales achievement plans yet</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Give each salesperson a yearly target and the incentive they earn at each level.</p>
              <ol className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                {[
                  ['1. Draft', 'HR picks the salesperson, sets the GM2 target, incentive tiers and terms.'],
                  ['2. Final', 'HR marks the plan Final once it has been checked.'],
                  ['3. Locked', 'A Super Admin locks it; the salesperson is notified and can download it.'],
                ].map(([t, d]) => (
                  <li key={t} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{t}</div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{d}</div>
                  </li>
                ))}
              </ol>
              <div className="mt-6">
                <Button variant="primary" icon={Plus} onClick={openNew}>Create the first plan</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400 gap-2">
              <Search className="w-6 h-6 text-slate-400" aria-hidden="true" />
              <p className="text-sm">No plans match these filters</p>
              <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setFyFilter(''); }}>Clear filters</Button>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Salesperson</th>
                  <th className="py-3 px-4 text-left font-medium">Financial year</th>
                  <th className="py-3 px-4 text-right font-medium">GM2 target</th>
                  <th className="py-3 px-4 text-left font-medium">Status</th>
                  <th className="py-3 px-4 text-left font-medium">Created by</th>
                  <th className="py-3 px-4 text-left font-medium">Updated</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filtered.map((r) => {
                  const status = STATUS_TONE[r.status || 'DRAFT'];
                  const isActing = actionLoading[r.id!];
                  const isPdfDl = pdfLoading === r.id;
                  const isLocked = r.status === 'LOCKED';
                  const isOpen = expandedId === r.id;
                  const toggle = () => setExpandedId(isOpen ? null : r.id!);
                  return (
                    <React.Fragment key={r.id}>
                    <tr
                      onClick={toggle}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isOpen ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      )}
                    >
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`plan-details-${r.id}`}
                          onClick={(e) => { e.stopPropagation(); toggle(); }}
                          className="inline-flex items-center gap-1.5 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                        >
                          <ChevronRight
                            className={cn('w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90 text-indigo-600 dark:text-indigo-400')}
                            aria-hidden="true"
                          />
                          {r.employeeName}
                        </button>
                      </td>
                      <td className="py-3 px-4">{r.financialYear}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-slate-900 dark:text-white">₹{r.gm2TargetCr}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={status.label} tone={status.tone} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{r.createdByName || '—'}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 tabular-nums">
                        {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!isLocked && (
                            <Button
                              variant="ghost"
                              icon={Pencil}
                              aria-label={`Edit ${r.employeeName}`}
                              title={r.status === 'FINAL' ? 'Edit (moves the plan back to Draft)' : 'Edit'}
                              onClick={() => { setEditingReport(r); setIsModalOpen(true); }}
                            />
                          )}
                          {r.status === 'DRAFT' && (
                            <Button
                              variant="ghost"
                              icon={isActing === 'finalize' ? Loader2 : CheckCircle2}
                              iconSpin={isActing === 'finalize'}
                              disabled={!!isActing}
                              title="Mark as Final"
                              onClick={() => handleFinalize(r.id!)}
                            >
                              Finalize
                            </Button>
                          )}
                          {isAdmin && r.status === 'FINAL' && (
                            <Button
                              variant="secondary"
                              icon={isActing === 'lock' ? Loader2 : Lock}
                              iconSpin={isActing === 'lock'}
                              disabled={!!isActing}
                              title="Lock and publish to the employee"
                              onClick={() => setPendingConfirm({ kind: 'lock', report: r })}
                            >
                              Lock
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            icon={Printer}
                            aria-label={`Print ${r.employeeName}'s plan`}
                            title="Print"
                            onClick={() => printChampsReport(toChampsData(r, companyName))}
                          />
                          <Button
                            variant="ghost"
                            icon={isPdfDl ? Loader2 : Download}
                            iconSpin={isPdfDl}
                            disabled={isPdfDl}
                            aria-label="Download PDF"
                            title="Download PDF"
                            onClick={() => handleDownloadPdf(r)}
                          />
                          {isAdmin && !isLocked && (
                            <Button
                              variant="ghost"
                              icon={isActing === 'delete' ? Loader2 : Trash2}
                              iconSpin={isActing === 'delete'}
                              disabled={!!isActing}
                              aria-label={`Delete ${r.employeeName}'s plan`}
                              title="Delete"
                              className="hover:text-rose-700 dark:hover:text-rose-400"
                              onClick={() => setPendingConfirm({ kind: 'delete', report: r })}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`plan-details-${r.id}`}>
                        <td colSpan={7} className="p-0">
                          <PlanDetails report={r} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {isModalOpen && (
        <SalesChampsReportModal
          report={editingReport}
          employees={employees}
          departments={departments}
          existingReports={reports}
          onSave={handleCreate}
          onClose={() => { setIsModalOpen(false); setEditingReport(null); }}
        />
      )}

      {/* Lock / delete confirmation */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-slate-900/60 p-4 modal-backdrop-enter">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="champs-confirm-title"
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-5 modal-card-enter"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={cn('w-5 h-5 shrink-0 mt-0.5', pendingConfirm.kind === 'delete' ? 'text-rose-600' : 'text-amber-600')}
                aria-hidden="true"
              />
              <div>
                <h3 id="champs-confirm-title" className="text-sm font-semibold text-slate-900 dark:text-white">
                  {pendingConfirm.kind === 'lock'
                    ? `Lock ${pendingConfirm.report.employeeName}'s ${pendingConfirm.report.financialYear} plan?`
                    : `Delete ${pendingConfirm.report.employeeName}'s ${pendingConfirm.report.financialYear} plan?`}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pendingConfirm.kind === 'lock'
                    ? 'The salesperson will be notified and can view and download it. A locked plan can never be edited or deleted.'
                    : 'This removes the plan permanently. It cannot be undone.'}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setPendingConfirm(null)} autoFocus>Cancel</Button>
              <Button
                variant="primary"
                icon={pendingConfirm.kind === 'lock' ? Lock : Trash2}
                className={pendingConfirm.kind === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : undefined}
                onClick={handleConfirmed}
              >
                {pendingConfirm.kind === 'lock' ? 'Lock plan' : 'Delete plan'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
