import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Gauge, ShieldCheck, Activity, Layers, RefreshCw, ShieldAlert, Swords, Coins, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { CAPABILITY_LEVELS, assessCapability } from '@/lib/sf2xGovernance';

// Full-history analytics charts with side-tab navigation. Pulls up to 2000
// records per entity (RLS-scoped: a user sees only their own, an admin sees
// all) and groups by day across the ENTIRE history — no 30-day / 200-record
// cap. Each tab is one detailed chart.

const CAP_COLORS = ['#34D399', '#38BDF8', '#FBBF24', '#FB923C', '#FB7185'];

const TABS = [
  { key: 'trust', label: 'Trust', Icon: Gauge },
  { key: 'verdicts', label: 'Verdicts', Icon: ShieldCheck },
  { key: 'metrics', label: 'Metrics', Icon: Activity },
  { key: 'capability', label: 'Capability', Icon: Layers },
  { key: 'corrections', label: 'Corrections', Icon: RefreshCw },
  { key: 'drift', label: 'Drift', Icon: ShieldAlert },
  { key: 'redteam', label: 'Red-Team', Icon: Swords },
  { key: 'credits', label: 'Credits', Icon: Coins },
];

const METRIC_KEYS = [
  { key: 'confidence_entropy', abbr: 'CE', color: '#38BDF8' },
  { key: 'expected_calibration_error', abbr: 'ECE', color: '#A78BFA' },
  { key: 'uncorrected_confidence_rate', abbr: 'UCR', color: '#FB7185' },
  { key: 'false_refusal_rate', abbr: 'FRR', color: '#FBBF24' },
];

const dayKey = (d) => String(d || '').slice(0, 10);
const axis = { tick: { fill: '#64748b', fontSize: 10 }, axisLine: false, tickLine: false };
const tooltipStyle = { background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 };

export default function HistoryCharts() {
  const [tab, setTab] = useState('trust');
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [versions, warrants, corrections, redRuns, usage] = await Promise.all([
          base44.entities.AnswerVersion.list('-created_date', 2000),
          base44.entities.Warrant.list('-created_date', 2000),
          base44.entities.CorrectionEvent.list('-created_date', 2000),
          base44.entities.RedTeamRun.list('-created_date', 2000),
          base44.entities.ApiUsage.list('-created_date', 2000),
        ]);
        const wMap = new Map(warrants.map((w) => [w.id, w]));
        const withTrust = versions.map((v) => {
          const w = wMap.get(v.warrant_id) || null;
          const t = computeTrustworthyRate(v.metrics, w);
          const verdict = w?.validity_status || (t >= 75 ? 'valid' : t >= 50 ? 'weak' : 'invalid');
          return { ...v, trust: t, verdict, warrant: w };
        });
        setRaw({ withTrust, corrections, redRuns, usage });
      } catch { setRaw(null); }
      finally { setLoading(false); }
    })();
  }, []);

  const series = useMemo(() => {
    if (!raw) return [];
    const byDay = {};
    const ensure = (d) => (byDay[d] = byDay[d] || { day: d, trustSum: 0, trustN: 0, valid: 0, weak: 0, invalid: 0, insufficient: 0, contested: 0, m: {}, driftSum: 0, driftN: 0, corr: 0, resisted: 0, wobbled: 0, broken: 0, credits: 0 });
    raw.withTrust.forEach((v) => {
      const d = dayKey(v.created_date); if (!d) return;
      const b = ensure(d);
      b.trustSum += v.trust; b.trustN++;
      b[v.verdict] = (b[v.verdict] || 0) + 1;
      METRIC_KEYS.forEach((m) => {
        const val = Number(v.metrics?.[m.key]);
        if (!Number.isNaN(val)) { b.m[m.key] = b.m[m.key] || { s: 0, n: 0 }; b.m[m.key].s += val; b.m[m.key].n++; }
      });
    });
    raw.corrections.forEach((c) => {
      const d = dayKey(c.created_date); if (!d) return;
      const b = ensure(d); b.corr++; b.driftSum += Number(c.drift_score) || 0; b.driftN++;
    });
    raw.redRuns.forEach((r) => {
      const d = dayKey(r.created_date); if (!d) return;
      const b = ensure(d);
      if (r.outcome === 'resisted') b.resisted++;
      else if (r.outcome === 'wobbled') b.wobbled++;
      else if (r.outcome === 'broken') b.broken++;
    });
    raw.usage.forEach((u) => {
      const d = dayKey(u.created_date) || (u.month ? u.month + '-01' : '');
      if (!d || d.endsWith('--01')) return;
      const b = ensure(d); b.credits += Number(u.credits) || 0;
    });
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).map((b) => ({
      day: b.day.slice(5), full: b.day,
      trust: b.trustN ? Math.round(b.trustSum / b.trustN) : null,
      valid: b.valid, weak: b.weak, invalid: b.invalid, insufficient: b.insufficient, contested: b.contested,
      drift: b.driftN ? +(b.driftSum / b.driftN).toFixed(3) : null,
      corrections: b.corr,
      resisted: b.resisted, wobbled: b.wobbled, broken: b.broken,
      credits: b.credits,
      ...Object.fromEntries(METRIC_KEYS.map((m) => {
        const mm = b.m[m.key]; return [m.abbr, mm && mm.n ? Math.round((mm.s / mm.n) * 100) : null];
      })),
    }));
  }, [raw]);

  const capDist = useMemo(() => {
    if (!raw) return [];
    return CAPABILITY_LEVELS.map((c) => ({
      name: c.key, value: raw.withTrust.filter((v) => assessCapability(v.stakes_level || '', v.trust, v.warrant).level === c.level).length,
    }));
  }, [raw]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-emerald-400 animate-spin" /></div>;
  if (!raw) return <div className="text-sm text-slate-500 py-10 text-center">No history available.</div>;

  const range = series.length ? `${series[0].full} → ${series[series.length - 1].full} · ${series.length} day${series.length === 1 ? '' : 's'}` : 'no data';

  return (
    <div className="grid lg:grid-cols-[150px_1fr] gap-4">
      <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar lg:overflow-visible">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
            <t.Icon className="h-4 w-4 shrink-0" /> {t.label}
          </button>
        ))}
      </div>

      <div>
        <div className="text-[11px] text-slate-500 mb-3">Full history · {range}</div>
        <div className="h-80">
          {series.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">No data yet.</div>
          ) : tab === 'trust' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis domain={[0, 100]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="trust" name="Trust" stroke="#34D399" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : tab === 'verdicts' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="valid" stackId="v" name="Valid" fill="#34D399" />
                <Bar dataKey="weak" stackId="v" name="Weak" fill="#FBBF24" />
                <Bar dataKey="contested" stackId="v" name="Contested" fill="#FB923C" />
                <Bar dataKey="insufficient" stackId="v" name="Insufficient" fill="#A78BFA" />
                <Bar dataKey="invalid" stackId="v" name="Invalid" fill="#FB7185" />
              </BarChart>
            </ResponsiveContainer>
          ) : tab === 'metrics' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis domain={[0, 100]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {METRIC_KEYS.map((m) => (
                  <Line key={m.abbr} type="monotone" dataKey={m.abbr} name={m.abbr} stroke={m.color} strokeWidth={1.5} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : tab === 'capability' ? (
            <div className="h-full flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie data={capDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2}>
                    {capDist.map((_, i) => <Cell key={i} fill={CAP_COLORS[i]} stroke="#0B0F16" />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {capDist.map((c, i) => (
                  <span key={c.name} className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: CAP_COLORS[i] }} /> {c.name} · {c.value}
                  </span>
                ))}
              </div>
            </div>
          ) : tab === 'corrections' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="corrections" name="Corrections" fill="#818CF8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : tab === 'drift' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis domain={[0, 1]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="drift" name="Drift score" stroke="#FB7185" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : tab === 'redteam' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="resisted" stackId="r" name="Resisted" fill="#34D399" />
                <Bar dataKey="wobbled" stackId="r" name="Wobbled" fill="#FBBF24" />
                <Bar dataKey="broken" stackId="r" name="Broken" fill="#FB7185" />
              </BarChart>
            </ResponsiveContainer>
          ) : tab === 'credits' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="credits" name="Credits" fill="#34D399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </div>
  );
}