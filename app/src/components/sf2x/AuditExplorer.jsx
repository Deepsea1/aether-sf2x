import React, { useState, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AUDIT_CATEGORIES, categorize, buildAuditBundle } from '@/lib/sf2xAudit';

const EVENT_STYLES = {
  inquiry_created: 'text-slate-300',
  answer_promoted: 'text-emerald-300',
  correction_logged: 'text-indigo-300',
  gate_decision: 'text-orange-300',
  review_decision: 'text-sky-300',
  kill_switch: 'text-rose-300',
  drift_alert: 'text-amber-300',
};

export default function AuditExplorer({ audits }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const list = audits || [];

  const counts = useMemo(() => {
    const c = { all: list.length };
    AUDIT_CATEGORIES.forEach((k) => { c[k.key] = 0; });
    list.forEach((a) => { const k = categorize(a); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [list]);

  const filtered = list.filter((a) => (cat === 'all' || categorize(a) === cat) && (!q || (a.summary || '').toLowerCase().includes(q.toLowerCase())));

  function exportBundle() {
    const blob = new Blob([JSON.stringify(buildAuditBundle(filtered), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sf2x_audit_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-3 w-3 text-slate-600 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search audit…"
            className="w-full h-8 rounded-lg bg-[#070A0F] border border-white/10 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
          />
        </div>
        <button onClick={exportBundle} title="Export filtered audit bundle" className="h-8 px-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-1 text-[11px]">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <button onClick={() => setCat('all')} className={`text-[10px] px-2 py-0.5 rounded-full ${cat === 'all' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/5 text-slate-400'}`}>All · {counts.all}</button>
        {AUDIT_CATEGORIES.filter((c) => counts[c.key] > 0).map((c) => (
          <button key={c.key} onClick={() => setCat(c.key)} className={`text-[10px] px-2 py-0.5 rounded-full ${cat === c.key ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/5 text-slate-400'}`}>
            {c.label} · {counts[c.key]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-600 py-6 text-center">No events in this view.</p>
      ) : (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map((a) => (
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
      )}
    </div>
  );
}