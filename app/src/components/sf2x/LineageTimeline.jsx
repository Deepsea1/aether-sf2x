import React from 'react';
import { GitBranch } from 'lucide-react';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { formatDistanceToNow } from 'date-fns';

export default function LineageTimeline({ versions, activeId, onSelect }) {
  if (!versions || versions.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-200">Truth Lineage</h3>
      </div>
      <div className="relative pl-4">
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/10" />
        <div className="space-y-1">
          {versions.map((v) => {
            const trust = computeTrustworthyRate(v.metrics, null);
            const active = v.id === activeId;
            return (
              <button
                key={v.id}
                onClick={() => onSelect(v)}
                className={`relative w-full text-left flex items-center gap-3 rounded-lg p-2 transition-colors ${
                  active ? 'bg-emerald-400/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className={`absolute -left-[14px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ring-4 ring-[#0B0F16] ${
                  active ? 'bg-emerald-400' : 'bg-slate-600'
                }`} />
                <span className="text-[11px] font-mono text-slate-500">v{v.version}</span>
                <span className="text-[11px] text-slate-400 truncate flex-1">
                  {v.answer_text?.slice(0, 42) || '—'}…
                </span>
                <span className="text-[11px] text-slate-500">{trust}</span>
                <span className="text-[10px] text-slate-600 hidden sm:inline">{formatDistanceToNow(new Date(v.created_date), { addSuffix: false })}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}