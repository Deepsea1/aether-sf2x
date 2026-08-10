import React from 'react';
import { History, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STAKES_COLOR = {
  low: 'text-slate-400 bg-white/5',
  medium: 'text-sky-300 bg-sky-400/10',
  high: 'text-amber-300 bg-amber-400/10',
  critical: 'text-rose-300 bg-rose-400/10',
};

export default function InquiryHistory({ inquiries, activeId, onSelect, onNew }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-200">Inquiries</h3>
        </div>
        <button onClick={onNew} className="flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>
      {inquiries.length === 0 ? (
        <p className="text-xs text-slate-600 py-4 text-center">No inquiries yet. Submit one to begin.</p>
      ) : (
        <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
          {inquiries.map((inq) => {
            const active = inq.id === activeId;
            return (
              <button
                key={inq.id}
                onClick={() => onSelect(inq.id)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                  active ? 'bg-white/[0.06] ring-1 ring-emerald-400/20' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STAKES_COLOR[inq.stakes_level] || STAKES_COLOR.medium}`}>
                    {inq.stakes_level}
                  </span>
                  <span className="text-[10px] text-slate-600">{inq.domain}</span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2 leading-snug">{inq.prompt}</p>
                <span className="text-[10px] text-slate-600">{formatDistanceToNow(new Date(inq.created_date), { addSuffix: false })} ago</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}