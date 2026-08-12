import React from 'react';
import { Link } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stateFor } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';

// "Not yet measured" as a first-class state (law #7).
//
// A missing number is not a zero and not an em-dash. This component says three things in
// order: what is missing, WHY it is missing, and the one action that would produce it
// (law #5 — no dead ends). An empty state that does not explain itself is indistinguishable
// from a bug, so `reason` is required in spirit even though React will not enforce it.
//
// The state is named out loud with a badge rather than implied by a dashed border —
// dashed belongs to `hypothesis` alone (law #3) and must not leak into layout chrome.
// The action is deliberately neutral: green means "supported", never "click me".

function ActionButton({ action }) {
  if (!action) return null;
  if (React.isValidElement(action)) return action;
  if (typeof action !== 'object') return null;

  const { label, to, href, onClick, icon: Icon } = action;
  if (!label) return null;

  const cls = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/[0.08]';
  const inner = (
    <>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </>
  );

  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noreferrer noopener">{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return null;
}

export default function HonestEmpty({
  title = 'Not yet measured',
  reason,
  action,
  state = 'unknown',
  icon: Icon = ScanSearch,
  align = 'center',
  className,
  children,
}) {
  const token = stateFor(state);
  const centered = align === 'center';
  // With no action supplied, still point somewhere: the state's own next step.
  const fallbackHint = !action && token.nextAction ? token.nextAction : null;

  return (
    <Surface tone="inset" className={cn('p-8', centered && 'text-center', className)}>
      <div className={cn('flex flex-col gap-3', centered ? 'items-center' : 'items-start')}>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 text-slate-400" />
        </span>

        <div className={cn('flex flex-wrap items-center gap-2', centered && 'justify-center')}>
          <p className="text-sm font-medium text-slate-200">{title}</p>
          <EpistemicBadge state={token.key} size="sm" />
        </div>

        {reason ? (
          <p className={cn('max-w-lg text-xs leading-relaxed text-slate-400', centered && 'mx-auto')}>{reason}</p>
        ) : null}

        {children}

        {action ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <ActionButton action={action} />
          </div>
        ) : fallbackHint ? (
          <p className="pt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">{fallbackHint}</p>
        ) : null}
      </div>
    </Surface>
  );
}
