import React from 'react';
import { GitBranch, Clock, FileQuestion, AlertTriangle } from 'lucide-react';

export default function WhatWouldChange({ warrant, version }) {
  if (!warrant) return null;
  const premises = Array.isArray(warrant.premises) ? warrant.premises : [];
  const sources = Array.isArray(warrant.sources) ? warrant.sources : [];

  const items = [];
  premises.slice(0, 5).forEach((p) => {
    items.push({ Icon: FileQuestion, text: `Premise is invalidated: “${p}”` });
  });
  if (sources.length) {
    items.push({ Icon: GitBranch, text: `A cited source is retracted or contradicted (${sources.length} source${sources.length === 1 ? '' : 's'} in play).` });
  }
  if (warrant.expiry_date) {
    items.push({ Icon: Clock, text: `The warrant expires and premises aren't revalidated by ${new Date(warrant.expiry_date).toLocaleDateString()}.` });
  }
  items.push({ Icon: AlertTriangle, text: `New evidence surfaces that the premises didn't account for.` });

  return (
    <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.03] p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-medium text-slate-200">What would change this answer?</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        This answer stays warranted only while its premises hold. It would change if any of these happen:
      </p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
            <it.Icon className="h-3.5 w-3.5 text-amber-300/80 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}