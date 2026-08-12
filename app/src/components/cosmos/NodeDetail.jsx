import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stateFor } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import { NODE_TYPE_LABEL, nextActionsFor, weightBreakdown, ageDays } from '@/lib/cosmos/graph';

// What a node actually is, and — non-negotiably — what to do about it.
//
// Law #5, enforced here rather than hoped for: `nextActionsFor` never returns an empty
// array, and this panel renders whatever it returns as the last block on the card. There
// is no code path where a visitor selects something and is left holding a description.
//
// The prominence bars exist so the map can be audited from the UI: if a node looks big,
// this panel shows you the three legal reasons why, and edge count is not among them.

function Bar({ label, value, hint }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="text-[10px] tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]" title={hint}>
        <div className="h-full rounded-full bg-slate-400/60" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function NodeDetail({ node, relations = [], now = Date.now(), onClose, className }) {
  if (!node) return null;
  const token = stateFor(node.state);
  const actions = nextActionsFor(node);
  const b = weightBreakdown(node, now);
  const days = ageDays(node.meta?.createdAt, now);
  const facts = Array.isArray(node.meta?.facts) ? node.meta.facts : [];

  return (
    <Surface glow={node.state} className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {NODE_TYPE_LABEL[node.type] || node.type}
          </div>
          <h3 className="mt-1 break-words text-[15px] font-medium text-white">{node.label}</h3>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <EpistemicBadge state={node.state} />
        <span className="text-[11px] tabular-nums text-slate-500">
          {days == null ? 'age not recorded' : days === 0 ? 'recorded today' : `${days} days old`}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{token.meaning}</p>

      {facts.length > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-white/10 pt-4">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-3">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{k}</dt>
              <dd className="break-words text-[12px] text-slate-300">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          Why it is drawn this size
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Bar label="Authority" value={b.authority} hint="Intrinsic standing: artifact type, cryptographic seal, preserved evidence." />
          <Bar label="Freshness" value={b.freshness} hint="How recently this was established. Age is shown, never converted into doubt." />
          <Bar label="State" value={b.state} hint="How loudly the epistemic state needs to be seen. Conflict ranks high." />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Those three, and only those three. Nothing here is sized by how many things point at it.
        </p>
      </div>

      {relations.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Relations ({relations.length})
          </div>
          <ul className="space-y-1.5">
            {relations.slice(0, 8).map((r, i) => (
              <li key={`${r.type}-${r.other?.id}-${i}`} className="flex items-start gap-2 text-[12px]">
                <span className="mt-[3px] shrink-0 rounded border border-white/10 px-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                  {r.direction === 'out' ? '→' : '←'} {r.type.replace(/_/g, ' ')}
                </span>
                <span className="min-w-0 truncate text-slate-300">{r.other?.label || r.otherId}</span>
              </li>
            ))}
          </ul>
          {relations.length > 8 ? (
            <p className="mt-1.5 text-[11px] text-slate-500">+{relations.length - 8} more</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Next action</div>
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <Link
              key={`${a.kind}-${a.label}`}
              to={a.to}
              className="inline-flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
            >
              <span>{a.label}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </Surface>
  );
}
