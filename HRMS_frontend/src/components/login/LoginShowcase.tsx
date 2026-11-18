import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, CircleCheck, FileText, Layers, UserRound } from 'lucide-react';

/**
 * The interactive brand panel on the login page.
 *
 * Everything here demonstrates how a review works rather than just decorating:
 *  - a spotlight follows the cursor across the panel,
 *  - the example KRA card tilts toward the cursor with a soft glare,
 *  - hovering a rating changes the points and the manager's reason,
 *  - the review path lights up stage by stage, and explains a stage on hover.
 *
 * Pointer effects write CSS variables straight onto elements (no React re-render per mouse
 * move). All motion stops for people who ask their device to reduce motion.
 */

const WEIGHT = 0.3; // the example KRA carries 30% of the scorecard

const SCALE = [
  { label: 'Needs improvement', reason: 'Onboarding took 11 days against a 5-day target, with repeated rework.' },
  { label: 'Developing', reason: 'Averaged 8 days. Improving each month, but still well over target.' },
  { label: 'Meets', reason: 'Averaged 6 days against the 5-day target. Quality was strong.' },
  { label: 'Exceeds', reason: 'Averaged 4 days, ahead of target, with no customer escalations.' },
  { label: 'Outstanding', reason: 'Averaged 3 days and built a checklist the whole team now uses.' },
];
const DEFAULT_RATING = 3;

const STAGES = [
  { label: 'Self-assessment', icon: FileText, detail: 'The employee rates each KRA and adds evidence.' },
  { label: 'Manager', icon: UserRound, detail: 'The manager scores every KRA with a written reason.' },
  { label: 'HOD', icon: Layers, detail: 'The head of department checks ratings are consistent.' },
  { label: 'HR approval', icon: CircleCheck, detail: 'HR gives the final sign-off and the review is locked.' },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
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

/** Animates a number towards `target` (ease-out), for the points figure. */
function useAnimatedNumber(target: number, enabled: boolean, durationMs = 450): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, durationMs]);
  return value;
}

// ---------------------------------------------------------------------------
// Panel with cursor spotlight
// ---------------------------------------------------------------------------
/** Cursor spotlight. Place as the first child of a `relative` panel; it listens on that panel. */
export const LoginShowcase: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const panel = layer?.parentElement;
    if (!layer || !panel || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const rect = panel.getBoundingClientRect();
      layer.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
      layer.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
      layer.style.setProperty('--spot-opacity', '1');
    };
    const onLeave = () => layer.style.setProperty('--spot-opacity', '0');
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerleave', onLeave);
    return () => {
      panel.removeEventListener('pointermove', onMove);
      panel.removeEventListener('pointerleave', onLeave);
    };
  }, [reducedMotion]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {/* Spotlight that follows the cursor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: 'var(--spot-opacity, 0)',
          background:
            'radial-gradient(520px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(165, 180, 252, 0.16), transparent 65%)',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Example KRA card: tilt + glare + live rating
// ---------------------------------------------------------------------------
export const InteractiveKraCard: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(DEFAULT_RATING);
  const [isUserControlled, setIsUserControlled] = useState(false);
  const points = useAnimatedNumber(rating * WEIGHT, !reducedMotion);

  // When nobody is interacting, gently show the scale in action.
  useEffect(() => {
    if (reducedMotion || isUserControlled) return;
    const sequence = [3, 4, 5, 4, 3, 2, 3];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % sequence.length;
      setRating(sequence[i]);
    }, 2600);
    return () => clearInterval(timer);
  }, [reducedMotion, isUserControlled]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el || reducedMotion) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty('--tilt-x', `${(0.5 - py) * 8}deg`);
    el.style.setProperty('--tilt-y', `${(px - 0.5) * 10}deg`);
    el.style.setProperty('--glare-x', `${px * 100}%`);
    el.style.setProperty('--glare-y', `${py * 100}%`);
    el.style.setProperty('--glare-opacity', '1');
  };

  const resetTilt = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
    el.style.setProperty('--glare-opacity', '0');
  }, []);

  const handlePointerLeave = () => {
    resetTilt();
    setIsUserControlled(false);
  };

  const choose = (value: number) => {
    setIsUserControlled(true);
    setRating(value);
  };

  const current = SCALE[rating - 1];

  return (
    // An illustration of the rating scale, not a real control: hidden from screen readers.
    <div className="[perspective:1000px]" aria-hidden="true">
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setIsUserControlled(true)}
        onPointerLeave={handlePointerLeave}
        className="relative rounded-2xl bg-white text-slate-900 p-4 xl:p-5 shadow-2xl shadow-indigo-950/40 transition-transform duration-200 ease-out will-change-transform [transform-style:preserve-3d]"
        style={{ transform: 'rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))' }}
      >
        {/* Glare */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            opacity: 'var(--glare-opacity, 0)',
            background: 'radial-gradient(360px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(99, 102, 241, 0.10), transparent 60%)',
          }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Example KRA</div>
            <div className="mt-0.5 text-sm xl:text-base font-semibold truncate">Customer onboarding within SLA</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm xl:text-base font-bold tabular-nums">+{points.toFixed(2)} pts</div>
            <div className="text-xs text-slate-500 tabular-nums">30% weight</div>
          </div>
        </div>

        <div className="relative mt-3.5 grid grid-cols-5 gap-1.5">
          {SCALE.map((s, i) => {
            const value = i + 1;
            const isSelected = value === rating;
            return (
              <button
                key={value}
                type="button"
                tabIndex={-1}
                onPointerEnter={() => choose(value)}
                onClick={() => choose(value)}
                className={`relative rounded-lg px-2 py-2 min-h-[3.25rem] text-left cursor-pointer transition-all duration-300 ease-out ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 -translate-y-0.5'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <div className="text-sm font-bold leading-none tabular-nums">{value}</div>
                <div className={`mt-1 text-[11px] leading-tight ${isSelected ? 'text-indigo-50' : 'text-slate-500'}`}>{s.label}</div>
              </button>
            );
          })}
        </div>

        {/* The reason changes with the rating: the product's whole point. */}
        <div className="relative mt-3 border-l-2 border-indigo-500 pl-2.5 min-h-[2.5rem]">
          <div className="text-[11px] font-semibold text-slate-700">Manager's reason</div>
          <p key={rating} className="text-xs text-slate-600 leading-snug animate-fadeIn">
            {current.reason}
          </p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Review path: stages light up in turn; hover explains a stage
// ---------------------------------------------------------------------------
export const InteractiveReviewPath: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (reducedMotion || hovered !== null) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1800);
    return () => clearInterval(timer);
  }, [reducedMotion, hovered]);

  const shown = hovered ?? active;

  return (
    <div className="mt-4 rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3 xl:px-5 pt-3.5 pb-3">
      <ol aria-label="How a review moves" className="flex items-center justify-between gap-1">
        {STAGES.map(({ label, icon: Icon }, i) => {
          const isDone = i < shown;
          const isCurrent = i === shown;
          return (
            <li key={label} className="contents">
              <span
                className="flex flex-col items-center gap-1.5 min-w-0 text-center cursor-default"
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered(null)}
              >
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isCurrent
                      ? 'bg-white text-indigo-700 ring-4 ring-white/20 scale-110'
                      : isDone
                        ? 'bg-indigo-400/40 text-white ring-1 ring-indigo-200/40'
                        : 'bg-white/10 text-white ring-1 ring-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-500 ${isCurrent ? 'text-white' : 'text-indigo-100/70'}`}>
                  {label}
                </span>
              </span>
              {i < STAGES.length - 1 && (
                <ChevronRight
                  className={`w-4 h-4 shrink-0 -mt-5 transition-colors duration-500 ${i < shown ? 'text-indigo-100' : 'text-indigo-200/40'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      <p key={shown} className="mt-2.5 pt-2.5 border-t border-white/10 text-center text-xs text-indigo-100/85 animate-fadeIn">
        {STAGES[shown].detail}
      </p>
    </div>
  );
};
