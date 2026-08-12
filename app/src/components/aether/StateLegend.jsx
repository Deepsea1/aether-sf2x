import React from 'react';
import { cn } from '@/lib/utils';
import { EPISTEMIC_ORDER, stateFor } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';

// The always-available key to the colour language — and the text alternative for any
// canvas, WebGL or graph view where colour is doing work a screen reader cannot see.
//
// Give the legend an `id` and point the visual at it:
//   <StateLegend id="cosmos-key" compact />
//   <canvas role="img" aria-label="Evidence cosmos" aria-describedby="cosmos-key" />
//
// Full mode prints every state's meaning. Compact mode prints icon + label only (still
// never colour alone) for a toolbar or a card footer.

export default function StateLegend({
  id,
  states = EPISTEMIC_ORDER,
  title = 'What the states mean',
  compact = false,
  className,
}) {
  const tokens = states.map(stateFor);

  if (compact) {
    return (
      <div id={id} className={cn('flex flex-wrap items-center gap-1.5', className)} role="list" aria-label={title}>
        {tokens.map((t) => (
          <span role="listitem" key={t.key}>
            <EpistemicBadge state={t.key} size="sm" />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div id={id} className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-5', className)}>
      <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <ul className="grid gap-2.5 sm:grid-cols-2" role="list">
        {tokens.map((t) => (
          <li key={t.key} className="flex items-start gap-2.5">
            <EpistemicBadge state={t.key} size="sm" className="mt-0.5 shrink-0" />
            <span className="text-[12px] leading-relaxed text-slate-400">{t.meaning}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-500">
        Colour never carries a verdict on its own — every state above also carries its icon and its
        name, here and everywhere else in the product.
      </p>
    </div>
  );
}
