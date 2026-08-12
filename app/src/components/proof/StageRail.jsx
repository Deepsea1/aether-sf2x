import React from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stateFor } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';

// The four acts, and the transport for moving through them.
//
// Every stage carries a state key from the token set, so the rail is a live
// summary as well as a nav: you can see at a glance that the seal verified and
// the log fold has not run yet. `unknown` — "not yet measured" — is the honest
// default for a stage that has not been reached or has nothing to work with; it
// is never rendered as a zero, a dash, or a hopeful green.
//
// Reduced motion is handled by the caller collapsing its own transitions; this
// component has no animation of its own beyond colour/opacity changes, which
// stay instant either way.

export default function StageRail({
  stages,          // [{ key, title, blurb, state }]
  active,
  onSelect,
  playing = false,
  onTogglePlay,
  canPlay = true,
  className,
}) {
  const last = stages.length - 1;

  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <ol className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2" role="list">
          {stages.map((s, i) => {
            const isActive = i === active;
            const token = stateFor(s.state || 'unknown');
            const settled = s.state && s.state !== 'unknown';
            return (
              <li key={s.key} className="min-w-[8.5rem] flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'group h-full w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70',
                    isActive
                      ? 'border-white/25 bg-white/[0.06]'
                      : 'border-white/10 bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums',
                        isActive ? 'border-white/30 text-slate-100' : 'border-white/15 text-slate-500',
                      )}
                      aria-hidden="true"
                    >
                      {settled
                        ? (s.state === 'supported'
                          ? <Check className="h-3 w-3" style={{ color: token.hex }} />
                          : <Minus className="h-3 w-3" style={{ color: token.hex }} />)
                        : i + 1}
                    </span>
                    <span className={cn('truncate text-[11px] uppercase tracking-[0.16em]', isActive ? 'text-slate-200' : 'text-slate-500')}>
                      {s.title}
                    </span>
                  </div>
                  <div className="mt-2">
                    <EpistemicBadge state={s.state || 'unknown'} size="sm" label={s.stateLabel} />
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(Math.max(0, active - 1))}
            disabled={active === 0}
            aria-label="Previous stage"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {onTogglePlay ? (
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!canPlay}
              aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onSelect(Math.min(last, active + 1))}
            disabled={active === last}
            aria-label="Next stage"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {stages[active]?.blurb ? (
        <p className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-slate-400">
          {stages[active].blurb}
        </p>
      ) : null}
    </div>
  );
}
