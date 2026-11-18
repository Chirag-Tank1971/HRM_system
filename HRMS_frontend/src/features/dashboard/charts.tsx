import React, { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

/* ------------------------------------------------------------------ Theme */

/**
 * Categorical palette (fixed order, validated for colour-blind separation and contrast on
 * white and on slate-900 with the dataviz validator). Light and dark are separate steps of
 * the same hues, not an automatic flip. Light slots 3-5 sit below 3:1 on white, so every
 * chart that uses them shows values as text (legend values or direct labels).
 */
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};

export interface ChartTheme {
  series: string[];
  /** Single-series colour (brand indigo). */
  primary: string;
  primarySoft: string;
  grid: string;
  axis: string;
  surface: string;
  animate: boolean;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function useChartTheme(): ChartTheme {
  const { isDark } = useTheme();
  const reduced = usePrefersReducedMotion();
  return isDark
    ? { series: CATEGORICAL.dark, primary: '#7f85d2', primarySoft: 'rgba(127,133,210,0.28)', grid: '#1e293b', axis: '#94a3b8', surface: '#0f172a', animate: !reduced }
    : { series: CATEGORICAL.light, primary: '#5d62bd', primarySoft: 'rgba(93,98,189,0.18)', grid: '#eef2f7', axis: '#64748b', surface: '#ffffff', animate: !reduced };
}

/* ------------------------------------------------------------------ Number count-up */

export function useCountUp(target: number, durationMs = 700): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const v = from + (target - from) * (1 - Math.pow(1 - t, 3));
      setValue(v);
      fromRef.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);
  return value;
}

/* ------------------------------------------------------------------ Shared pieces */

const TOOLTIP_BOX = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-xs';

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

const TooltipBox: React.FC<{ title: string; rows: TooltipRow[] }> = ({ title, rows }) => (
  <div className={TOOLTIP_BOX}>
    <div className="font-semibold text-slate-900 dark:text-white mb-1">{title}</div>
    {rows.map((r) => (
      <div key={r.label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        {r.color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: r.color }} aria-hidden="true" />}
        <span className="flex-1">{r.label}</span>
        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{r.value}</span>
      </div>
    ))}
  </div>
);

/** A visually hidden table so screen-reader users get the same numbers as the chart. */
const SrTable: React.FC<{ caption: string; headers: string[]; rows: Array<Array<string | number>> }> = ({ caption, headers, rows }) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <thead>
      <tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
      ))}
    </tbody>
  </table>
);

const axisTick = (theme: ChartTheme) => ({ fill: theme.axis, fontSize: 11 });

export const LegendRow: React.FC<{ items: Array<{ label: string; color: string; value?: string }> }> = ({ items }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
    {items.map((i) => (
      <li key={i.label} className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden="true" />
        {i.label}
        {i.value && <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{i.value}</span>}
      </li>
    ))}
  </ul>
);

export const NoData: React.FC<{ message: string; className?: string }> = ({ message, className }) => (
  <div className={cn('flex items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400 py-10', className)}>{message}</div>
);

/* ------------------------------------------------------------------ Headcount trend (area) */

export interface TrendPoint {
  label: string;
  headcount: number;
  joined: number;
  left: number;
}

export const HeadcountTrendChart: React.FC<{ data: TrendPoint[] }> = ({ data }) => {
  const theme = useChartTheme();
  if (!data.some((d) => d.headcount > 0)) return <NoData message="No joining dates recorded yet." />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="hcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={theme.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={axisTick(theme)} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(label)}
                  rows={[
                    { label: 'Headcount', value: String(payload[0].payload.headcount), color: theme.primary },
                    { label: 'Joined', value: String(payload[0].payload.joined) },
                    { label: 'Left', value: String(payload[0].payload.left) },
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="headcount"
            stroke={theme.primary}
            strokeWidth={2}
            fill="url(#hcFill)"
            activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={theme.animate}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
      <SrTable caption="Headcount by month" headers={['Month', 'Headcount', 'Joined', 'Left']} rows={data.map((d) => [d.label, d.headcount, d.joined, d.left])} />
    </div>
  );
};

/* ------------------------------------------------------------------ Joiners vs exits (bars) */

export const JoinersExitsChart: React.FC<{ data: TrendPoint[] }> = ({ data }) => {
  const theme = useChartTheme();
  const [joinColor, leftColor] = theme.series;
  if (!data.some((d) => d.joined || d.left)) return <NoData message="No joiners or exits in the last 12 months." />;
  return (
    <div className="space-y-2">
      <LegendRow
        items={[
          { label: 'Joined', color: joinColor, value: String(data.reduce((s, d) => s + d.joined, 0)) },
          { label: 'Left', color: leftColor, value: String(data.reduce((s, d) => s + d.left, 0)) },
        ]}
      />
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={axisTick(theme)} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: theme.primarySoft }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      { label: 'Joined', value: String(payload[0].payload.joined), color: joinColor },
                      { label: 'Left', value: String(payload[0].payload.left), color: leftColor },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="joined" fill={joinColor} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={theme.animate} animationDuration={800} />
            <Bar dataKey="left" fill={leftColor} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={theme.animate} animationDuration={800} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption="Joiners and exits by month" headers={['Month', 'Joined', 'Left']} rows={data.map((d) => [d.label, d.joined, d.left])} />
    </div>
  );
};

/* ------------------------------------------------------------------ Horizontal bars (e.g. by department) */

export const HorizontalBars: React.FC<{ data: Array<{ label: string; count: number }>; unit: string; caption: string; onSelect?: (label: string) => void }> = ({
  data,
  unit,
  caption,
}) => {
  const theme = useChartTheme();
  if (!data.length) return <NoData message="Nothing to show yet." />;
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={120} tick={axisTick(theme)} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: theme.primarySoft }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: unit, value: String(payload[0].payload.count), color: theme.primary }]} />
              ) : null
            }
          />
          <Bar dataKey="count" fill={theme.primary} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={theme.animate} animationDuration={800}>
            <LabelList dataKey="count" position="right" style={{ fill: theme.axis, fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SrTable caption={caption} headers={['Group', unit]} rows={data.map((d) => [d.label, d.count])} />
    </div>
  );
};

/* ------------------------------------------------------------------ Single-series columns (e.g. leave per month) */

export const ColumnChart: React.FC<{ data: Array<{ label: string; value: number }>; unit: string; caption: string; emptyMessage: string }> = ({
  data,
  unit,
  caption,
  emptyMessage,
}) => {
  const theme = useChartTheme();
  if (!data.some((d) => d.value > 0)) return <NoData message={emptyMessage} />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -18 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axisTick(theme)} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: theme.primarySoft }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={String(label)} rows={[{ label: unit, value: String(payload[0].payload.value), color: theme.primary }]} />
              ) : null
            }
          />
          <Bar dataKey="value" fill={theme.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={theme.animate} animationDuration={800}>
            <LabelList dataKey="value" position="top" style={{ fill: theme.axis, fontSize: 11, fontWeight: 600 }} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SrTable caption={caption} headers={['Month', unit]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
};

/* ------------------------------------------------------------------ Donut with hover */

export const DonutChart: React.FC<{
  data: Array<{ label: string; value: number }>;
  /** Shown in the middle when nothing is hovered, e.g. "employees". */
  totalLabel: string;
  caption: string;
  emptyMessage: string;
  /** Formats values in the legend and centre. */
  format?: (n: number) => string;
}> = ({ data, totalLabel, caption, emptyMessage, format = (n) => String(n) }) => {
  const theme = useChartTheme();
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = data.filter((d) => d.value > 0).slice(0, theme.series.length);
  const total = shown.reduce((s, d) => s + d.value, 0);
  if (!total) return <NoData message={emptyMessage} />;
  const centre = hovered !== null ? shown[hovered] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke={theme.surface}
              strokeWidth={2}
              isAnimationActive={theme.animate}
              animationDuration={900}
              onMouseEnter={(_, i) => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {shown.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={theme.series[i]}
                  style={{ transition: 'opacity 200ms', cursor: 'default' }}
                  opacity={hovered === null || hovered === i ? 1 : 0.35}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{format(centre ? centre.value : total)}</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[6.5rem] truncate">{centre ? centre.label : totalLabel}</span>
        </div>
      </div>
      <ul className="flex-1 w-full space-y-1.5">
        {shown.map((d, i) => (
          <li
            key={d.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className={cn('flex items-center gap-2 text-sm rounded-md px-1.5 py-0.5 transition-colors', hovered === i && 'bg-slate-100 dark:bg-slate-800')}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: theme.series[i] }} aria-hidden="true" />
            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{d.label}</span>
            <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{format(d.value)}</span>
            <span className="w-10 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <SrTable caption={caption} headers={['Group', 'Value', 'Share']} rows={shown.map((d) => [d.label, format(d.value), `${Math.round((d.value / total) * 100)}%`])} />
    </div>
  );
};
