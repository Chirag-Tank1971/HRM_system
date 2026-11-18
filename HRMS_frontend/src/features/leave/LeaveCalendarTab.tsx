import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { toast } from '../../context/ToastContext';
import {
  hrApi,
  addDaysIso,
  formatDays,
  todayIso,
  type Holiday,
  type LeaveRequest,
} from '../../services/hrApi';

const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const LONG_DAY_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const pad = (n: number) => String(n).padStart(2, '0');
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** What is happening on one date. */
interface DayInfo {
  date: string;
  inMonth: boolean;
  isWeeklyOff: boolean;
  holidays: Holiday[];
  /** Restricted (optional) holidays: a working day unless the employee chooses to take it. */
  restricted: Holiday[];
  leaves: LeaveRequest[];
}

// One colour per kind of day, used by the day cells, the name chips and the legend.
// `cell` tints the whole day with a see-through wash of the colour; `swatch` is the same wash
// for the legend; `dot` is the solid colour for small markers.
const KIND = {
  holiday: {
    label: 'Holiday',
    cell: 'bg-emerald-500/15 border-emerald-500/40 dark:bg-emerald-400/15 dark:border-emerald-400/40',
    swatch: 'bg-emerald-500/25 border border-emerald-500/60',
    chip: 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-100',
    dot: 'bg-emerald-500',
  },
  restricted: {
    label: 'Restricted holiday (RH)',
    cell: 'bg-amber-500/15 border-amber-500/40 dark:bg-amber-400/15 dark:border-amber-400/40',
    swatch: 'bg-amber-500/25 border border-amber-500/60',
    chip: 'bg-amber-500/20 text-amber-900 dark:text-amber-100',
    dot: 'bg-amber-500',
  },
  weeklyOff: {
    label: 'Weekly off',
    cell: 'bg-rose-500/10 border-rose-500/30 dark:bg-rose-400/10 dark:border-rose-400/30',
    swatch: 'bg-rose-500/20 border border-rose-500/50',
    chip: 'bg-rose-500/15 text-rose-900 dark:text-rose-100',
    dot: 'bg-rose-500',
  },
  myLeave: {
    label: 'My leave',
    cell: 'bg-indigo-500/15 border-indigo-500/40 dark:bg-indigo-400/15 dark:border-indigo-400/40',
    swatch: 'bg-indigo-500/25 border border-indigo-500/60',
    chip: 'bg-indigo-500/20 text-indigo-900 dark:text-indigo-100',
    dot: 'bg-indigo-500',
  },
  pending: {
    label: 'My leave, awaiting approval',
    cell: 'bg-indigo-500/5 border-dashed border-indigo-500/60 dark:bg-indigo-400/5 dark:border-indigo-400/60',
    swatch: 'bg-indigo-500/10 border border-dashed border-indigo-500/80',
    chip: 'bg-indigo-500/10 text-indigo-900 border border-dashed border-indigo-500/50 dark:text-indigo-100',
    dot: 'bg-indigo-300 ring-1 ring-indigo-500',
  },
  others: {
    label: 'Others on leave',
    cell: 'bg-sky-500/10 border-sky-500/30 dark:bg-sky-400/10 dark:border-sky-400/30',
    swatch: 'bg-sky-500/20 border border-sky-500/50',
    chip: 'bg-sky-500/20 text-sky-900 dark:text-sky-100',
    dot: 'bg-sky-500',
  },
} as const;

interface LeaveCalendarTabProps {
  myEmployeeId?: string;
  /** Bumped by the parent when leave changes, so the calendar reloads. */
  refreshKey?: number;
}

export const LeaveCalendarTab: React.FC<LeaveCalendarTabProps> = ({ myEmployeeId, refreshKey = 0 }) => {
  const today = todayIso();
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [selected, setSelected] = useState(today);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([0]);
  const [holidaysByYear, setHolidaysByYear] = useState<Record<number, Holiday[]>>({});
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [year, monthNumber] = month.split('-').map(Number);

  // The grid always shows whole weeks: from the Sunday on or before the 1st to the Saturday
  // on or after the last day of the month.
  const gridDates = useMemo(() => {
    const first = `${month}-01`;
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const last = `${month}-${pad(daysInMonth)}`;
    const start = addDaysIso(first, -weekdayOf(first));
    const end = addDaysIso(last, 6 - weekdayOf(last));
    const out: string[] = [];
    for (let d = start; d <= end; d = addDaysIso(d, 1)) out.push(d);
    return out;
  }, [month, year, monthNumber]);

  useEffect(() => {
    hrApi
      .getCompany()
      .then((c) => setWeeklyOffDays(c.settings.weeklyOffDays || [0]))
      .catch(() => undefined); // falls back to Sunday
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const from = gridDates[0];
    const to = gridDates[gridDates.length - 1];
    const years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])];

    Promise.all([
      hrApi.getLeaveCalendar(from, to),
      myEmployeeId ? hrApi.getLeaveRequests('mine') : Promise.resolve([] as LeaveRequest[]),
      ...years.map((y) => hrApi.getHolidays(y).then((list) => [y, list] as const)),
    ])
      .then(([calendar, mine, ...holidayLists]) => {
        if (cancelled) return;
        // The calendar feed covers the team; add the user's own pending and approved leave too.
        const byId = new Map<string, LeaveRequest>();
        for (const r of [...(calendar as LeaveRequest[]), ...(mine as LeaveRequest[])]) {
          if ((r.status === 'APPROVED' || r.status === 'PENDING') && r.fromDate <= to && r.toDate >= from) byId.set(r.id, r);
        }
        setLeaves([...byId.values()]);
        setHolidaysByYear((prev) => ({ ...prev, ...Object.fromEntries(holidayLists as Array<readonly [number, Holiday[]]>) }));
      })
      .catch((err) => !cancelled && toast.error(err.message || 'Could not load the calendar.', 'Load failed'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [gridDates, myEmployeeId, refreshKey]);

  const days: DayInfo[] = useMemo(() => {
    const allHolidays = Object.values(holidaysByYear).flat();
    return gridDates.map((date) => {
      const onDate = allHolidays.filter((h) => h.date === date);
      return {
        date,
        inMonth: date.startsWith(month),
        isWeeklyOff: weeklyOffDays.includes(weekdayOf(date)),
        holidays: onDate.filter((h) => !h.optional),
        restricted: onDate.filter((h) => h.optional),
        leaves: leaves
          .filter((l) => l.fromDate <= date && l.toDate >= date)
          .sort((a, b) => Number(b.employeeId === myEmployeeId) - Number(a.employeeId === myEmployeeId) || a.employeeName.localeCompare(b.employeeName)),
      };
    });
  }, [gridDates, month, holidaysByYear, weeklyOffDays, leaves, myEmployeeId]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  const goToToday = () => {
    setMonth(today.slice(0, 7));
    setSelected(today);
  };

  const selectedDay = days.find((d) => d.date === selected);
  const leaveKind = (l: LeaveRequest) => (l.employeeId === myEmployeeId ? (l.status === 'PENDING' ? KIND.pending : KIND.myLeave) : KIND.others);
  const leaveLabel = (l: LeaveRequest) => (l.employeeId === myEmployeeId ? l.leaveTypeName || 'My leave' : l.employeeName);

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <section className={`${CARD} lg:col-span-2`} aria-label="Leave calendar">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white" aria-live="polite">
            {MONTH_FMT.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}
          </h2>
          <div className="flex items-center gap-1.5">
            <Button onClick={goToToday} disabled={month === today.slice(0, 7) && selected === today}>Today</Button>
            <Button variant="ghost" icon={ChevronLeft} aria-label="Previous month" onClick={() => shiftMonth(-1)} />
            <Button variant="ghost" icon={ChevronRight} aria-label="Next month" onClick={() => shiftMonth(1)} />
          </div>
        </div>

        <div className={`p-2 sm:p-3 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 pb-1.5">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isToday = day.date === today;
              const isSelected = day.date === selected;
              // The cell takes the colour of the most significant thing on that day.
              const mine = day.leaves.find((l) => l.employeeId === myEmployeeId);
              const tint = day.holidays.length
                ? KIND.holiday.cell
                : mine
                  ? leaveKind(mine).cell
                  : day.restricted.length
                    ? KIND.restricted.cell
                    : day.isWeeklyOff
                      ? KIND.weeklyOff.cell
                      : day.leaves.length
                        ? KIND.others.cell
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700';
              const chips = [
                ...day.holidays.map((h) => ({ key: h.id, text: h.name, kind: KIND.holiday })),
                ...day.restricted.map((h) => ({ key: h.id, text: `RH · ${h.name}`, kind: KIND.restricted })),
                ...day.leaves.map((l) => ({ key: l.id, text: leaveLabel(l), kind: leaveKind(l) })),
              ];
              const summary = [
                ...day.holidays.map((h) => `holiday: ${h.name}`),
                ...day.restricted.map((h) => `restricted holiday: ${h.name}`),
                day.isWeeklyOff ? 'weekly off' : '',
                day.leaves.length ? `${day.leaves.length} on leave` : '',
              ].filter(Boolean).join(', ');

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelected(day.date)}
                  aria-pressed={isSelected}
                  aria-label={`${LONG_DAY_FMT.format(new Date(`${day.date}T00:00:00Z`))}${summary ? `, ${summary}` : ''}`}
                  className={`relative min-h-[3.75rem] sm:min-h-[5.5rem] rounded-md border p-1 sm:p-1.5 text-left align-top flex flex-col gap-0.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tint} ${
                    isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900' : ''
                  } ${day.inMonth ? '' : 'opacity-45'}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs tabular-nums ${
                        isToday ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {Number(day.date.slice(8))}
                    </span>
                  </span>

                  {/* Wide screens: names. Narrow screens: one dot per item. */}
                  <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
                    {chips.slice(0, 2).map((c) => (
                      <span key={c.key} className={`block truncate rounded px-1 py-px text-[10px] leading-4 font-medium ${c.kind.chip}`}>{c.text}</span>
                    ))}
                    {chips.length > 2 && <span className="text-[10px] text-slate-500 dark:text-slate-400">+{chips.length - 2} more</span>}
                  </span>
                  <span className="flex sm:hidden flex-wrap gap-0.5" aria-hidden="true">
                    {chips.slice(0, 4).map((c) => <span key={c.key} className={`w-1.5 h-1.5 rounded-full ${c.kind.dot}`} />)}
                  </span>
                </button>
              );
            })}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400" aria-label="Legend">
            {Object.values(KIND).map((k) => (
              <li key={k.label} className="inline-flex items-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded ${k.swatch}`} aria-hidden="true" />
                {k.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${CARD} self-start`} aria-label="Selected day">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {LONG_DAY_FMT.format(new Date(`${selected}T00:00:00Z`))}
          </h2>
          {selected === today && <p className="text-xs text-indigo-700 dark:text-indigo-400">Today</p>}
        </div>
        <div className="p-4 space-y-3 text-sm">
          {!selectedDay ? null : (
            <>
              {selectedDay.holidays.map((h) => (
                <DetailRow key={h.id} kind={KIND.holiday} title={h.name} note={`Holiday${h.locations?.length ? ` · ${h.locations.join(', ')}` : ''}. Not counted as leave.`} />
              ))}
              {selectedDay.restricted.map((h) => (
                <DetailRow key={h.id} kind={KIND.restricted} title={h.name} note="Restricted holiday (RH). A working day unless you choose to take it as leave." />
              ))}
              {selectedDay.isWeeklyOff && <DetailRow kind={KIND.weeklyOff} title="Weekly off" note="Not a working day." />}
              {selectedDay.leaves.map((l) => (
                <DetailRow
                  key={l.id}
                  kind={leaveKind(l)}
                  title={l.employeeId === myEmployeeId ? `You · ${l.leaveTypeName || 'Leave'}` : l.employeeName}
                  note={[
                    l.employeeId !== myEmployeeId && l.leaveTypeName ? l.leaveTypeName : '',
                    formatDays(l.days),
                    l.fromDate === l.toDate ? '' : `${Number(l.fromDate.slice(8))}/${Number(l.fromDate.slice(5, 7))} to ${Number(l.toDate.slice(8))}/${Number(l.toDate.slice(5, 7))}`,
                    l.status === 'PENDING' ? 'awaiting approval' : 'approved',
                  ].filter(Boolean).join(' · ')}
                />
              ))}
              {selectedDay.holidays.length === 0 && selectedDay.restricted.length === 0 && !selectedDay.isWeeklyOff && selectedDay.leaves.length === 0 && (
                <p className="text-slate-500 dark:text-slate-400">A regular working day. Nobody you can see is on leave.</p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

const DetailRow: React.FC<{ kind: { dot: string }; title: string; note: string }> = ({ kind, title, note }) => (
  <div className="flex items-start gap-2.5">
    <span className={`mt-1.5 w-2.5 h-2.5 rounded-sm shrink-0 ${kind.dot}`} aria-hidden="true" />
    <div className="min-w-0">
      <div className="font-medium text-slate-900 dark:text-white">{title}</div>
      <div className="text-xs text-slate-600 dark:text-slate-400">{note}</div>
    </div>
  </div>
);
