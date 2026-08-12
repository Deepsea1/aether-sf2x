import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Sparkles, Clock, Ban, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stateFor } from '@/lib/design/tokens';

// The single rendering point for an epistemic verdict, and the enforcement point for
// law #2: colour is never the only signal.
//
// Every render carries an icon AND the state's text label AND its colour. There is no
// prop that produces a bare colour swatch: `withLabel={false}` still emits the label as
// sr-only text plus a tooltip, and still keeps `supported` and `qualified` apart without
// colour — they share the ShieldCheck icon, so `qualified` also carries a visible ± mark.
// If you want a naked dot, you want a different component and you are probably breaking
// the law.

const ICONS = { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Sparkles, Clock, Ban, Lock };

// Colour-independent disambiguators for states that share an icon.
const MARK = { qualified: '±' };

const SIZES = {
  sm: { box: 'gap-1 px-2 py-[2px] text-[10px]', icon: 'h-3 w-3', mark: 'text-[9px]' },
  md: { box: 'gap-1.5 px-2.5 py-1 text-[11px]', icon: 'h-3.5 w-3.5', mark: 'text-[10px]' },
  lg: { box: 'gap-2 px-3 py-1.5 text-[13px]', icon: 'h-4 w-4', mark: 'text-[11px]' },
};

export default function EpistemicBadge({
  state,
  size = 'md',
  withLabel = true,
  label,          // optional display override for dense rows ("Stale · 41d")
  className,
  title,
}) {
  const token = stateFor(state);
  const Icon = ICONS[token.icon] || ShieldQuestion;
  const dims = SIZES[size] || SIZES.md;
  const text = label || token.label;
  const mark = MARK[token.key];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium align-middle whitespace-nowrap',
        token.cls,
        token.dashed && 'border-dashed',
        dims.box,
        className,
      )}
      aria-label={`Epistemic state: ${text}`}
      title={title || token.meaning || token.label}
    >
      <Icon className={cn(dims.icon, 'shrink-0')} aria-hidden="true" />
      {mark ? (
        <span className={cn(dims.mark, '-ml-0.5 font-semibold leading-none')} aria-hidden="true">{mark}</span>
      ) : null}
      {withLabel ? <span>{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}
