import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Hourglass,
  Inbox,
  PartyPopper,
  Plane,
  UserMinus,
} from 'lucide-react';
import { Card, type Navigate } from '../../components/dashboard/DashboardKit';
import { cn } from '../../utils/cn';
import type { DashboardInsights } from '../../services/hrApi';
import { ColumnChart, DonutChart, HeadcountTrendChart, HorizontalBars, JoinersExitsChart, useCountUp } from './charts';

/* ------------------------------------------------------------------ Dates */

const DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (iso: string) => DAY_FMT.format(new Date(`${iso}T00:00:00Z`));
const fmtWeekday = (iso: string) => WEEKDAY_FMT.format(new Date(`${iso}T00:00:00Z`));
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
const whenText = (today: string, date: string) => {
  const d = daysBetween(today, date);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/* ------------------------------------------------------------------ Section heading */

export const SectionHeading: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <div className="flex items-baseline justify-between gap-3 pt-2">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
    {note && <span className="text-xs text-slate-400 dark:text-slate-500">{note}</span>}
  </div>
);

/* ------------------------------------------------------------------ Today strip */

interface TodayTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: 'default' | 'attention';
  onClick?: () => void;
  delay: number;
  children?: React.ReactNode;
}

const TodayTile: React.FC<TodayTileProps> = ({ icon: Icon, label, value, detail, tone = 'default', onClick, delay, children }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'group relative text-left rounded-xl border bg-white dark:bg-slate-900 p-4 min-w-0 animate-fadeIn',
        tone === 'attention' ? 'border-amber-300/80 dark:border-amber-700/70' : 'border-slate-200/80 dark:border-slate-800',
        onClick && 'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              tone === 'attention' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </span>
          {label}
        </span>
        {onClick && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
      </div>
      <div className="mt-3 text-lg font-semibold text-slate-900 dark:text-white truncate">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{detail}</div>
      {children}
    </Tag>
  );
};

export interface CycleInfo {
  name: string;
  daysLeft?: number;
  /** 0-100, for the viewer's scope; undefined when there is nothing to measure. */
  percent?: number;
  percentLabel?: string;
}

export const TodayStrip: React.FC<{ insights: DashboardInsights | null; cycle: CycleInfo | null; onNavigate: Navigate }> = ({ insights, cycle, onNavigate }) => {
  const approvals = insights?.approvalsPending ?? 0;
  const away = insights?.awayToday ?? [];
  const holiday = insights?.upcomingHolidays[0];
  return (
    <section aria-label="Today" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <TodayTile
        icon={Inbox}
        label="Approvals"
        delay={0}
        tone={approvals ? 'attention' : 'default'}
        value={approvals ? `${plural(approvals, 'request')} waiting` : 'All caught up'}
        detail={approvals ? 'Waiting for your decision' : insights?.myOpenRequests ? `${plural(insights.myOpenRequests, 'request')} of yours in progress` : 'Nothing needs your approval'}
        onClick={() => onNavigate('approvals')}
      />
      <TodayTile
        icon={Plane}
        label="Away today"
        delay={60}
        value={away.length ? plural(away.length, 'person', 'people') : 'Everyone in'}
        detail={away.length ? away.slice(0, 2).map((a) => a.name.split(' ')[0]).join(', ') + (away.length > 2 ? ` +${away.length - 2}` : '') : 'No approved leave today'}
        onClick={() => onNavigate('calendar')}
      />
      <TodayTile
        icon={PartyPopper}
        label="Next holiday"
        delay={120}
        value={holiday ? holiday.name : 'None scheduled'}
        detail={holiday && insights ? `${whenText(insights.today, holiday.date)} · ${fmtWeekday(holiday.date)}${holiday.optional ? ' · Restricted' : ''}` : 'HR has not published upcoming holidays'}
        onClick={() => onNavigate('calendar')}
      />
      <TodayTile
        icon={ClipboardCheck}
        label="Review cycle"
        delay={180}
        value={cycle ? cycle.name : 'No active cycle'}
        detail={
          cycle
            ? [cycle.daysLeft !== undefined ? (cycle.daysLeft >= 0 ? `${plural(cycle.daysLeft, 'day')} left` : `${-cycle.daysLeft} days overdue`) : '', cycle.percent !== undefined ? `${Math.round(cycle.percent)}% ${cycle.percentLabel || 'done'}` : '']
                .filter(Boolean)
                .join(' · ')
            : 'Reviews open when a period starts'
        }
        onClick={() => onNavigate('reviews')}
      >
        {cycle?.percent !== undefined && (
          <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-700" style={{ width: `${Math.max(2, Math.min(100, cycle.percent))}%` }} />
          </div>
        )}
      </TodayTile>
    </section>
  );
};

/* ------------------------------------------------------------------ KPI tile */

const KpiTile: React.FC<{
  label: string;
  value: number;
  format?: (n: number) => string;
  suffix?: string;
  trend?: { up?: number; down?: number; note?: string };
  hint?: string;
  onClick?: () => void;
  delay: number;
}> = ({ label, value, format = (n) => String(Math.round(n)), suffix, trend, hint, onClick, delay }) => {
  const animated = useCountUp(value);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 px-4 py-3.5 min-w-0 animate-fadeIn',
        onClick && 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
      )}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">{format(animated)}</span>
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </p>
      {trend && (trend.up || trend.down || trend.note) ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
          {!!trend.up && (
            <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              {trend.up} joined
            </span>
          )}
          {!!trend.down && (
            <span className="inline-flex items-center gap-0.5 text-rose-700 dark:text-rose-400">
              <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
              {trend.down} left
            </span>
          )}
          {trend.note && <span className="text-slate-500 dark:text-slate-400">{trend.note}</span>}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</p>
      ) : null}
    </Tag>
  );
};

/* ------------------------------------------------------------------ Workforce */

export const WorkforceSection: React.FC<{ insights: DashboardInsights; onNavigate: Navigate; compact?: boolean }> = ({ insights, onNavigate, compact }) => {
  const w = insights.workforce;
  if (!w) return null;
  const probationEnding = insights.upcoming?.probationEnding.length ?? 0;
  const isOrg = insights.scope === 'ORG';
  const groupRows = isOrg ? w.byDepartment : w.byLocation;

  return (
    <div className="space-y-3">
      <SectionHeading title={`Workforce · ${insights.scopeLabel}`} note="Live from employee records" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Headcount"
          value={w.headcount}
          delay={0}
          trend={{ up: w.joinedThisMonth, down: w.leftThisMonth, note: !w.joinedThisMonth && !w.leftThisMonth ? 'No change this month' : 'this month' }}
          onClick={isOrg ? () => onNavigate('employees') : undefined}
        />
        <KpiTile
          label="On probation"
          value={w.byStatus.probation}
          delay={60}
          hint={probationEnding ? `${plural(probationEnding, 'probation')} ending in 30 days` : `${w.byStatus.notice} serving notice`}
        />
        <KpiTile
          label="Attrition, last 12 months"
          value={w.attritionRate}
          format={(n) => n.toFixed(1)}
          suffix="%"
          delay={120}
          hint={`${plural(w.leftLast12, 'exit')} · ${plural(w.joinedLast12, 'joiner')}`}
        />
        <KpiTile label="Average tenure" value={w.averageTenureYears} format={(n) => n.toFixed(1)} suffix="years" delay={180} hint={`${w.byStatus.notice} serving notice`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Headcount over 12 months" subtitle="Employees on the books at each month end" className="lg:col-span-2">
          <HeadcountTrendChart data={w.trend} />
        </Card>
        <Card title="Gender" subtitle="Active employees">
          <DonutChart
            data={w.byGender.map((g) => ({ label: g.label, value: g.count }))}
            totalLabel="employees"
            caption="Active employees by gender"
            emptyMessage="Gender is not recorded yet."
          />
        </Card>
      </div>

      {!compact && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={isOrg ? 'People by department' : 'People by location'} subtitle="Active employees" className="lg:col-span-2">
              <HorizontalBars data={groupRows} unit="Employees" caption={isOrg ? 'Active employees by department' : 'Active employees by location'} />
            </Card>
            <Card title="Tenure" subtitle="Time since joining">
              <HorizontalBars data={w.tenureBands} unit="Employees" caption="Active employees by tenure" />
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Joiners and exits" subtitle="Per month, last 12 months" className="lg:col-span-2">
              <JoinersExitsChart data={w.trend} />
            </Card>
            <Card title="Employment type" subtitle="Active employees">
              <DonutChart
                data={w.byEmploymentType.map((g) => ({ label: g.label, value: g.count }))}
                totalLabel="employees"
                caption="Active employees by employment type"
                emptyMessage="Employment type is not recorded yet."
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ Leave */

export const AwayThisWeekCard: React.FC<{ insights: DashboardInsights; onNavigate: Navigate; className?: string }> = ({ insights, onNavigate, className }) => {
  const rows = insights.awayThisWeek;
  return (
    <Card title="Away this week" subtitle="Approved leave, next 7 days" action={{ label: 'Calendar', onClick: () => onNavigate('calendar') }} className={className}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Nobody you can see is on leave this week.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.slice(0, 7).map((r, i) => (
            <li key={`${r.employeeId}-${r.fromDate}-${i}`} className="flex items-center gap-3 animate-fadeIn" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 text-xs font-semibold flex items-center justify-center shrink-0">
                {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {r.fromDate === r.toDate ? fmtWeekday(r.fromDate) : `${fmtDay(r.fromDate)} – ${fmtDay(r.toDate)}`} · {plural(r.days, 'day')}
                </div>
              </div>
            </li>
          ))}
          {rows.length > 7 && <li className="text-xs text-slate-500 dark:text-slate-400">+{rows.length - 7} more on the calendar</li>}
        </ul>
      )}
    </Card>
  );
};

export const LeaveSection: React.FC<{ insights: DashboardInsights; onNavigate: Navigate }> = ({ insights, onNavigate }) => {
  const l = insights.leave;
  if (!l) return null;
  return (
    <div className="space-y-3">
      <SectionHeading title={`Leave · ${insights.scopeLabel}`} note="Approved leave, working days" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Requests awaiting approval" value={l.pendingRequests} delay={0} hint={l.pendingRequests ? 'Across your scope' : 'Nothing pending'} onClick={() => onNavigate('leave')} />
        <KpiTile label="On leave today" value={insights.awayToday.length} delay={60} hint={insights.awayThisWeek.length ? `${plural(insights.awayThisWeek.length, 'leave')} this week` : 'None this week'} onClick={() => onNavigate('calendar')} />
        <KpiTile label="Leave days this month" value={l.daysThisMonth} format={fmtNum} delay={120} hint="Approved" />
        <KpiTile label="Leave days this year" value={l.daysThisYear} format={fmtNum} delay={180} hint="Approved" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Leave by type" subtitle="This year">
          <DonutChart data={l.byType.map((t) => ({ label: t.label, value: t.days }))} totalLabel="days" caption="Approved leave days by type this year" emptyMessage="No approved leave this year yet." format={fmtNum} />
        </Card>
        <Card title="Leave per month" subtitle="Last 6 months">
          <ColumnChart data={l.trend.map((t) => ({ label: t.label, value: t.days }))} unit="Days" caption="Approved leave days per month" emptyMessage="No approved leave in the last 6 months." />
        </Card>
        <AwayThisWeekCard insights={insights} onNavigate={onNavigate} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ Upcoming dates */

export const UpcomingCard: React.FC<{ insights: DashboardInsights; onNavigate: Navigate; className?: string }> = ({ insights, onNavigate, className }) => {
  const items: Array<{ key: string; date: string; title: string; detail: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = [];
  for (const h of insights.upcomingHolidays) {
    items.push({ key: `h-${h.date}-${h.name}`, date: h.date, title: h.name, detail: h.optional ? 'Restricted holiday' : 'Holiday', icon: PartyPopper, tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' });
  }
  for (const p of insights.upcoming?.probationEnding ?? []) {
    items.push({ key: `p-${p.employeeId}`, date: p.date, title: p.name, detail: 'Probation ends', icon: Hourglass, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' });
  }
  for (const a of insights.upcoming?.anniversaries ?? []) {
    items.push({ key: `a-${a.employeeId}`, date: a.date, title: a.name, detail: `${plural(a.years, 'year')} at the company`, icon: CalendarClock, tone: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' });
  }
  for (const x of insights.upcoming?.leaving ?? []) {
    if (x.date && x.date >= insights.today) {
      items.push({ key: `x-${x.employeeId}`, date: x.date, title: x.name, detail: 'Last working day', icon: UserMinus, tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' });
    }
  }
  for (const m of insights.myLeave?.upcoming ?? []) {
    items.push({ key: `m-${m.id}`, date: m.fromDate, title: `Your ${m.leaveTypeName}`, detail: `${plural(m.days, 'day')} · ${m.status === 'PENDING' ? 'awaiting approval' : 'approved'}`, icon: Plane, tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card title="Coming up" subtitle="Holidays, leave and people dates" action={{ label: 'Calendar', onClick: () => onNavigate('calendar') }} className={className}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Nothing scheduled in the next few weeks.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 8).map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.key} className="flex items-center gap-3 animate-fadeIn" style={{ animationDelay: `${i * 40}ms` }}>
                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', it.tone)}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{it.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{it.detail}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">{fmtDay(it.date)}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{whenText(insights.today, it.date)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ My leave (everyone with an employee record) */

export const MyLeaveCard: React.FC<{ insights: DashboardInsights; onNavigate: Navigate; className?: string }> = ({ insights, onNavigate, className }) => {
  const mine = insights.myLeave;
  if (!mine) return null;
  // Types the employee has never had any of (e.g. comp-off before earning one) are left out.
  const balances = mine.balances.filter((b) => b.credited > 0 || b.available !== 0 || b.pending > 0);
  return (
    <Card title="My leave" subtitle={`${fmtNum(mine.usedThisYear)} days taken this year`} action={{ label: 'History', onClick: () => onNavigate('leave') }} className={className}>
      {balances.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">No leave balances yet.</p>
      ) : (
        <ul className="space-y-3">
          {balances.map((b, i) => {
            const usedShare = b.credited > 0 ? Math.min(100, (b.used / b.credited) * 100) : 0;
            return (
              <li key={b.code} className="animate-fadeIn" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: b.color }} aria-hidden="true" />
                    {b.name}
                  </span>
                  <span className="shrink-0">
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{fmtNum(b.available)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400"> available</span>
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                  role="img"
                  aria-label={`${b.name}: ${fmtNum(b.used)} of ${fmtNum(b.credited)} days used this year`}
                >
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${usedShare}%`, backgroundColor: b.color }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {fmtNum(b.used)} of {fmtNum(b.credited)} used this year{b.pending > 0 ? ` · ${fmtNum(b.pending)} awaiting approval` : ''}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onNavigate('leave')}
        className="mt-4 w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
      >
        <CalendarPlus className="w-4 h-4" aria-hidden="true" />
        Apply for leave
      </button>
    </Card>
  );
};

/* ------------------------------------------------------------------ Team snapshot (manager) */

export const TeamSnapshot: React.FC<{ insights: DashboardInsights; onNavigate: Navigate }> = ({ insights, onNavigate }) => {
  const w = insights.workforce;
  const l = insights.leave;
  if (!w || !l) return null;
  return (
    <div className="space-y-3">
      <SectionHeading title={`People · ${insights.scopeLabel}`} note="Live from employee and leave records" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Team size" value={w.headcount} delay={0} hint={w.byStatus.probation ? `${w.byStatus.probation} on probation` : 'Active members'} />
        <KpiTile label="On leave today" value={insights.awayToday.length} delay={60} onClick={() => onNavigate('calendar')} hint={insights.awayThisWeek.length ? `${plural(insights.awayThisWeek.length, 'leave')} this week` : 'None this week'} />
        <KpiTile label="Leave requests waiting" value={l.pendingRequests} delay={120} onClick={() => onNavigate('approvals')} hint={l.pendingRequests ? 'Approve from Approvals' : 'Nothing pending'} />
        <KpiTile label="Team leave this year" value={l.daysThisYear} format={fmtNum} suffix="days" delay={180} hint="Approved" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Team leave per month" subtitle="Last 6 months" className="lg:col-span-2">
          <ColumnChart data={l.trend.map((t) => ({ label: t.label, value: t.days }))} unit="Days" caption="Approved team leave days per month" emptyMessage="No approved team leave in the last 6 months." />
        </Card>
        <AwayThisWeekCard insights={insights} onNavigate={onNavigate} />
      </div>
    </div>
  );
};

