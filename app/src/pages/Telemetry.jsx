import React, { useEffect, useMemo, useState } from 'react';
import { Radar, Search, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';

const GROUP_LABELS = {
  identity: 'Identity',
  prompt: 'Prompt',
  model: 'Model',
  retrieval: 'Retrieval',
  tool: 'Tool',
  governance: 'Governance',
  evaluation: 'Evaluation',
  review: 'Review',
  provenance: 'Provenance',
  performance: 'Performance',
  drift: 'Drift',
  export_pack: 'Export',
};

const SEVERITY_STYLES = {
  info: 'text-slate-400 bg-slate-500/10',
  warn: 'text-amber-400 bg-amber-500/10',
  error: 'text-rose-400 bg-rose-500/10',
};

function SpanCard({ evt }) {
  const [open, setOpen] = useState(false);
  const ctx = evt.context || {};
  const groups = Object.keys(ctx).filter((k) => k !== 'summary' && ctx[k]);
  return (
    <div className="border border-white/5 rounded-lg bg-white/[0.02]">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${SEVERITY_STYLES[evt.severity] || SEVERITY_STYLES.info}`}>{evt.severity || 'info'}</span>
        <span className="font-mono text-xs text-slate-200">{evt.event_type}</span>
        <span className="text-[11px] text-slate-500">· {evt.span_type}</span>
        {evt.group && <span className="text-[10px] text-emerald-400/80 ml-1">{GROUP_LABELS[evt.group] || evt.group}</span>}
        {evt.linked_entity_type && (
          <span className="text-[10px] text-slate-500 ml-auto">{evt.linked_entity_type}:{(evt.linked_entity_id || '').slice(0, 8)}</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {ctx.summary && <p className="text-xs text-slate-400">{ctx.summary}</p>}
          {groups.map((g) => (
            <div key={g} className="text-xs">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{GROUP_LABELS[g] || g}</div>
              <pre className="text-[11px] text-slate-300 bg-black/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">{JSON.stringify(ctx[g], null, 2)}</pre>
            </div>
          ))}
          <div className="text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Raw record</div>
            <pre className="text-[11px] text-slate-400 bg-black/40 rounded p-2 overflow-x-auto font-mono">{JSON.stringify(evt, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceGroup({ traceId, events }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-white/10 rounded-xl bg-[#0B0F16] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05]">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <Radar className="h-4 w-4 text-emerald-400" />
        <span className="font-mono text-xs text-slate-200">trace {traceId}</span>
        <span className="text-[11px] text-slate-500 ml-1">{events.length} span{events.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {events.map((e) => <SpanCard key={e.id} evt={e} />)}
        </div>
      )}
    </div>
  );
}

export default function Telemetry() {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const recs = await base44.entities.Telemetry.list('-created_date', 200);
        setAll(recs || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) => {
      if (group !== 'all' && e.group !== group) return false;
      if (!term) return true;
      return [e.trace_id, e.event_type, e.span_type, e.group, e.linked_entity_type, e.linked_entity_id, e.context?.summary, JSON.stringify(e.context || {})]
        .join(' ').toLowerCase().includes(term);
    });
  }, [all, q, group]);

  const traces = useMemo(() => {
    const map = new Map();
    filtered.forEach((e) => {
      if (!map.has(e.trace_id)) map.set(e.trace_id, []);
      map.get(e.trace_id).push(e);
    });
    return [...map.entries()].sort((a, b) => new Date(b[1][0].created_date) - new Date(a[1][0].created_date));
  }, [filtered]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white flex items-center gap-2">
            <Radar className="h-6 w-6 text-emerald-400" /> Telemetry Appendix
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Raw evidence layer — traces, spans, and grouped context beneath governance, review, and provenance.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search trace id, event, entity, context…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
          <ResponsiveSelect
            value={group}
            onValueChange={setGroup}
            options={[{ value: 'all', label: 'All groups' }, ...Object.entries(GROUP_LABELS).map(([k, v]) => ({ value: k, label: v }))]}
            placeholder="All groups"
            triggerClassName="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-slate-200"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>
        ) : traces.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">No telemetry records found.</div>
        ) : (
          <div className="space-y-3">
            {traces.map(([tid, evs]) => <TraceGroup key={tid} traceId={tid} events={evs} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}