import React from 'react';

const STYLES = {
  starter: 'bg-slate-400/10 text-slate-300 ring-slate-400/30',
  pro: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
  enterprise: 'bg-violet-400/10 text-violet-300 ring-violet-400/30',
  scale: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
};
const LABELS = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', scale: 'Scale' };

export default function TierBadge({ tier, size = 'sm' }) {
  const cls = STYLES[tier] || STYLES.starter;
  const pad = size === 'lg' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center rounded-full ring-1 font-medium uppercase tracking-[0.14em] ${cls} ${pad}`}>
      {LABELS[tier] || tier}
    </span>
  );
}