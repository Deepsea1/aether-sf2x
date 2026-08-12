import React from 'react';
import {
  ShieldCheck, Swords, Clock, Crosshair, Waves, UserCircle, ShieldQuestion,
  AlertTriangle, History, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LENS } from '@/lib/design/tokens';
import { lensLine } from '@/lib/cosmos/graph';

// The ten ways to interrogate the same body of evidence (§21.2).
//
// Two rules make this a rail rather than a filter bar:
//   1. Every lens states, in one line, what it reveals — a lens you cannot describe is
//      decoration.
//   2. A lens with nothing in it says "0" on its own tab BEFORE you click it, and the
//      canvas hands you an honest empty when you do. We never open a blank void and let
//      the visitor wonder whether the page broke.

const ICONS = {
  ShieldCheck, Swords, Clock, Crosshair, Waves, UserCircle, ShieldQuestion,
  AlertTriangle, History, Sparkles,
};

export default function LensRail({ value, onChange, availability = {}, className }) {
  const active = LENS.find((l) => l.key === value) || LENS[0];

  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-3', className)}>
      <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">Lenses</div>
      <div
        role="tablist"
        aria-label="Cosmos lenses"
        aria-orientation="horizontal"
        className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible"
      >
        {LENS.map((lens) => {
          const Icon = ICONS[lens.icon] || ShieldCheck;
          const count = availability[lens.key] ?? 0;
          const isActive = lens.key === active.key;
          const empty = count === 0;
          return (
            <button
              key={lens.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange?.(lens.key)}
              title={lens.description}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70',
                isActive
                  ? 'border-white/25 bg-white/[0.08] text-white'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-slate-200',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-slate-200' : 'text-slate-500')} aria-hidden="true" />
              <span>{lens.label}</span>
              <span
                className={cn(
                  'rounded px-1 text-[10px] tabular-nums',
                  empty ? 'text-slate-600' : 'text-slate-400',
                )}
              >
                {count}
              </span>
              {empty ? <span className="sr-only">— nothing in this lens today</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 border-t border-white/10 px-1 pt-2 text-[12px] leading-relaxed text-slate-400">
        <span className="text-slate-300">{active.label}.</span> {lensLine(active.key) || active.description}
      </p>
    </div>
  );
}
