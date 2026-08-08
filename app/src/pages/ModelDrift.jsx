import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { TrendingDown, AlertTriangle, Minus, Waves, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { ALL_MODELS } from '@/lib/sf2xBench';

const RECENT_DAYS = 14;
const WINDOW_DAYS = 60;
const SLIP_THRESHOLD = 0.10;
const WATCH_THRESHOLD = 0.05;
const MIN_SAMPLES = 2;

const modelMeta = (val) => ALL_MODELS.find((m) => m.value === val) || { value: val, label: val, tag: 'Other' };

function accuracyOf(r) {
  if (r.correctness != null && !Number.isNaN(Number(r.correctness))) return Number(r.correctness) * 100;
  if (r.trust_score != null && !Number.isNaN(Number(r.trust_score))) return Number(r.trust_score);
  return null;
}

const STATUS = {
  slipping: { label: 'Slipping', Icon: TrendingDown, cls: 'text-rose-300 bg-rose-500/10 ring-rose-500/30' },
  watch: { label: 'Watch', Icon: AlertTriangle, cls: 'text-amber-300 bg-amber-500/10 ring-amber-500/30' },
  stable: { label: 'Stable', Icon: Minus, cls: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' },
  insufficient: { label: 'Insufficient data', Icon: Minus, cls: 'text-slate-400 bg-white/5 ring-white/10' },
};

function MiniBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{value != null ? value.toFixed(1) : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ModelDrift() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sinceMs = Date.now() - WINDOW_DAYS * 86400000;
        const all = await base44.entities.ModelBenchRun.list('-created_date', 2000);
        const list = (all || []).filter((r) => new Date(r.question_date || r.created_date || '').getTime() >= sinceMs);
        setRuns(list);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const driftRows = useMemo(() => {
    const now = Date.now();
    const recentStart = now - RECENT_DAYS * 86400000;
    const baseStart = now - WINDOW_DAYS * 86400000;
    const baseEnd = now - RECENT_DAYS * 86400000;
    const byModel = new Map();
    runs.forEach((r) => {
      const acc = accuracyOf(r);
      if (acc == null) return;
      const ts = new Date(r.question_date || r.created_date).getTime();
      if (Number.isNaN(ts)) return;
      if (!byModel.has(r.model)) byModel.set(r.model, { recent: [], base: [] });
      if (ts >= recentStart) byModel.get(r.model).recent.push(acc);
      else if (ts >= baseStart && ts < baseEnd) byModel.get(r.model).base.push(acc);
    });
    const rows = [];
    byModel.forEach((arr, model) => {
      const meta = modelMeta(model);
      const baseAvg = arr.base.length >= MIN_SAMPLES ? arr.base.reduce((s, v) => s + v, 0) / arr.base.length : null;
      const recentAvg = arr.recent.length >= MIN_SAMPLES ? arr.recent.reduce((s, v) => s + v, 0) / arr.recent.length : null;
      let status = 'stable';
      let drift = null;
      let relDrop = null;
      if (baseAvg != null && recentAvg != null) {
        drift = baseAvg - recentAvg;
        relDrop = baseAvg > 0 ? drift / baseAvg : 0;
        if (relDrop >= SLIP_THRESHOLD) status = 'slipping';
        else if (relDrop >= WATCH_THRESHOLD) status = 'watch';
      } else {
        status = 'insufficient';
      }
      rows.push({ model, meta, baseAvg, recentAvg, drift, relDrop, status, baseSamples: arr.base.length, recentSamples: arr.recent.length });
    });
    const order = { slipping: 0, watch: 1, stable: 2, insufficient: 3 };
    return rows.sort((a, b) => (order[a.status] - order[b.status]) || ((b.relDrop || 0) - (a.relDrop || 0)));
  }, [runs]);

  const counts = useMemo(() => ({
    slipping: driftRows.filter((r) => r.status === 'slipping').length,
    watch: driftRows.filter((r) => r.status === 'watch').length,
    stable: driftRows.filter((r) => r.status === 'stable').length,
    insufficient: driftRows.filter((r) => r.status === 'insufficient').length,
  }), [driftRows]);

  const barData = driftRows.filter((r) => r.drift != null).map((r) => ({ model: r.meta.label, drift: +r.drift.toFixed(1), status: r.status }));
  const barColor = (s) => (s === 'slipping' ? '#FB7185' : s === 'watch' ? '#FBBF24' : '#34D399');

  const chips = [
    { key: 'slipping', label: 'Slipping', value: counts.slipping, cls: 'text-rose-300 bg-rose-500/10 ring-rose-500/30' },
    { key: 'watch', label: 'Watch', value: counts.watch, cls: 'text-amber-300 bg-amber-500/10 ring-amber-500/30' },
    { key: 'stable', label: 'Stable', value: counts.stable, cls: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' },
    { key: 'insufficient', label: 'Insufficient', value: counts.insufficient, cls: 'text-slate-400 bg-white/5 ring-white/10' },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white flex items-center gap-2">
            <Waves className="h-6 w-6 text-emerald-400" /> Model Drift
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tracks accuracy drift per model provider. Recent 14-day average is compared against the prior 46-day baseline — models whose accuracy drops more than 10% are flagged as slipping.
          </p>
        </div>

        {counts.slipping > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm text-rose-200 font-medium">{counts.slipping} model{counts.slipping === 1 ? '' : 's'} slipping</div>
              <div className="text-xs text-rose-300/70 mt-0.5">Accuracy dropped more than 10% versus the baseline window. Review the highlighted cards below.</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {chips.map((c) => (
            <div key={c.key} className={`rounded-xl ring-1 px-4 py-3 ${c.cls}`}>
              <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] mt-1 opacity-80">{c.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>
        ) : driftRows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-10 text-center text-sm text-slate-500">
            No benchmark runs in the last {WINDOW_DAYS} days to measure drift yet.
          </div>
        ) : (
          <>
            {barData.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
                <h3 className="text-sm font-medium text-slate-200 mb-4">Accuracy drift by model (baseline − recent, points)</h3>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
                      <YAxis type="category" dataKey="model" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} stroke="rgba(255,255,255,0.08)" />
                      <Tooltip
                        contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(v) => [`${v > 0 ? '−' : '+'}${Math.abs(v)} pts`, 'Drift']}
                      />
                      <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                      <Bar dataKey="drift" radius={[0, 4, 4, 0]}>
                        {barData.map((d, i) => <Cell key={i} fill={barColor(d.status)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {driftRows.map((r) => {
                const S = STATUS[r.status];
                return (
                  <div key={r.model} className={`rounded-xl border bg-[#0B0F16] p-4 ${r.status === 'slipping' ? 'border-rose-500/40' : r.status === 'watch' ? 'border-amber-500/30' : 'border-white/10'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-200">{r.meta.label}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{r.meta.tag} · {r.model}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ring-1 ${S.cls}`}>
                        <S.Icon className="h-3 w-3" /> {S.label}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      <MiniBar label="Baseline avg" value={r.baseAvg} color="#64748b" />
                      <MiniBar label="Recent avg" value={r.recentAvg} color={barColor(r.status)} />
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-500">
                      <span>drift: <span className={`tabular-nums font-medium ${r.drift != null && r.drift > 0 ? 'text-rose-300' : r.drift != null ? 'text-emerald-300' : 'text-slate-600'}`}>{r.drift != null ? `${r.drift > 0 ? '−' : '+'}${Math.abs(r.drift).toFixed(1)} pts` : '—'}</span></span>
                      <span>{r.baseSamples}b / {r.recentSamples}r samples</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}