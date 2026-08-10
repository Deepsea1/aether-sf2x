import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ALL_MODELS } from '@/lib/sf2xBench';
import { COMPANY_OF_MODEL, companyColor, topModelPerCompany, isDailyTrackedModel } from '@/lib/sf2xCompanies';
import CompanyBadge from '@/components/sf2x/CompanyBadge';

const METRICS = {
  trust: { key: 'trust_score', label: 'Trust', domain: [0, 100], suffix: '' },
  correctness: { key: 'correctness', label: 'Correctness', domain: [0, 1], suffix: '', fmt: (v) => `${Math.round(v * 100)}%` },
  latency: { key: 'latency_ms', label: 'Latency', domain: ['auto', 'auto'], suffix: 'ms' },
};

const modelLabel = (val) => ALL_MODELS.find((m) => m.value === val)?.label || val;

export default function ModelTrendChart() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('trust');
  const [hidden, setHidden] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      try {
        const sinceMs = Date.now() - 29 * 86400000;
        const all = await base44.entities.ModelBenchRun.list('-created_date', 1000);
        const list = (all || []).filter((r) => new Date(r.question_date || r.created_date || '').getTime() >= sinceMs);
        setRuns(list);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  // Per-model aggregate score for the selected metric — used to pick ONE model per company.
  const modelScore = useMemo(() => {
    const m = METRICS[metric];
    const acc = new Map();
    for (const r of runs) {
      const val = Number(r[m.key]);
      if (val == null || Number.isNaN(val)) continue;
      if (!acc.has(r.model)) acc.set(r.model, { sum: 0, count: 0 });
      const a = acc.get(r.model);
      a.sum += val;
      a.count += 1;
    }
    const out = new Map();
    for (const [model, a] of acc) out.set(model, metric === 'latency' ? -a.sum / a.count : a.sum / a.count);
    return out;
  }, [runs, metric]);

  const topByCompany = useMemo(() => {
    const rows = [...modelScore.entries()].map(([model, score]) => ({ model, company: COMPANY_OF_MODEL.get(model) || '—', score }));
    return topModelPerCompany(rows, (r) => r.score).sort((a, b) => (isDailyTrackedModel(a.model) ? 0 : 1) - (isDailyTrackedModel(b.model) ? 0 : 1));
  }, [modelScore]);

  const chartData = useMemo(() => {
    const m = METRICS[metric];
    const byDate = new Map();
    runs.forEach((r) => {
      const d = r.question_date || (r.created_date || '').slice(0, 10);
      if (!d) return;
      const val = Number(r[m.key]);
      if (val == null || Number.isNaN(val)) return;
      if (!byDate.has(d)) byDate.set(d, {});
      const bucket = byDate.get(d);
      if (!bucket[r.model]) bucket[r.model] = { sum: 0, count: 0 };
      bucket[r.model].sum += val;
      bucket[r.model].count += 1;
    });
    return [...byDate.keys()].sort().map((d) => {
      const row = { date: d };
      const bucket = byDate.get(d);
      Object.keys(bucket).forEach((k) => {
        row[k] = metric === 'latency' ? Math.round(bucket[k].sum / bucket[k].count) : +(bucket[k].sum / bucket[k].count).toFixed(2);
      });
      return row;
    });
  }, [runs, metric]);

  const toggle = (co) => setHidden((prev) => {
    const n = new Set(prev);
    if (n.has(co)) n.delete(co); else n.add(co);
    return n;
  });

  const m = METRICS[metric];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" /> 30-day model performance trend
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">One line per company — its top-scoring model. <span className="text-emerald-300">Daily-tracked</span> models listed first; tap a logo to toggle.</p>
        </div>
        <div className="inline-flex rounded-lg bg-white/[0.03] border border-white/10 p-0.5">
          {Object.keys(METRICS).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${metric === k ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {METRICS[k].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>
      ) : chartData.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">No benchmark runs in the last 30 days yet.</div>
      ) : (
        <>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(d) => d.slice(5)} stroke="rgba(255,255,255,0.08)" />
                <YAxis domain={m.domain} tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" width={44} tickFormatter={(v) => m.fmt ? m.fmt(v) : v} />
                <Tooltip
                  contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value, name) => [`${value}${m.suffix}`, modelLabel(name)]}
                />
                {topByCompany.map((row) => !hidden.has(row.company) && (
                  <Line key={row.model} type="monotone" dataKey={row.model} name={row.model} stroke={companyColor(row.company)} strokeWidth={2.5} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Logos lined up across the bottom — one per company (its top model). */}
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
            {topByCompany.map((row) => {
              const on = !hidden.has(row.company);
              return (
                <button
                  key={row.company}
                  onClick={() => toggle(row.company)}
                  title={`${row.company} · ${modelLabel(row.model)}`}
                  className={`inline-flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${on ? 'border-white/15 text-slate-200 bg-white/[0.04]' : 'border-white/5 text-slate-600 bg-transparent'}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? companyColor(row.company) : 'transparent', border: on ? 'none' : '1px solid currentColor' }} />
                  <CompanyBadge company={row.company} showName={false} />
                  <span className="text-slate-500 hidden sm:inline">{modelLabel(row.model)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}