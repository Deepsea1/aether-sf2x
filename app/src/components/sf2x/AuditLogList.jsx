import React from 'react';
import { formatDistanceToNow } from 'date-fns';

const EVENT_STYLES = {
  inquiry_created: 'text-slate-300',
  answer_promoted: 'text-emerald-300',
  correction_logged: 'text-indigo-300',
  gate_decision: 'text-orange-300',
  review_decision: 'text-sky-300',
  kill_switch: 'text-rose-300',
  drift_alert: 'text-amber-300',
};

export default function AuditLogList({ audits }) {
  if (!audits || audits.length === 0) {
    return <p className="text-xs text-slate-600 py-6 text-center">No governance events recorded.</p>;
  }
  return (
    <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
      {audits.map((a) => (
        <div key={a.id} className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono uppercase tracking-wider ${EVENT_STYLES[a.event_type] || 'text-slate-400'}`}>
              {a.event_type.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-slate-600">{formatDistanceToNow(new Date(a.created_date), { addSuffix: true })}</span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">{a.summary}</p>
        </div>
      ))}
    </div>
  );
}