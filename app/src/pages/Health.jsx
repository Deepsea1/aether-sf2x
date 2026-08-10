import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { Activity, Gauge, GitBranch, AlertTriangle, ShieldCheck, Timer, Waves } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import StatCard from '@/components/sf2x/StatCard';
import EpistemicTrendChart from '@/components/sf2x/EpistemicTrendChart';
import { METRIC_DEFS, computeTrustworthyRate } from '@/lib/sf2x';
import { CAPABILITY_LEVELS, assessCapability, SEVERITY_STYLES } from '@/lib/sf2xGovernance';

const CAP_COLORS = ['#34D399', '#38BDF8', '#FBBF24', '#FB923C', '#FB7185'];

function ChartCard({ title, subtitle, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      {children}
    </motion.div>
  );
}

export default function Health() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [inquiries, versions, corrections, audits] = await Promise.all([
          base44.entities.Inquiry.list('-created_date', 200),
          base44.entities.AnswerVersion.list('-created_date', 200),
          base44.entities.CorrectionEvent.list('-created_date', 200),
          base44.entities.AuditLog.list('-created_date', 200),
        ]);
        const warrants = await base44.entities.Warrant.list('-created_date', 200);
        const warrantMap = new Map(warrants.map((w) => [w.id, w]));
        const inquiryMap = new Map(inquiries.map((i) => [i.id, i]));

        const withTrust = versions.map((v) => {
          const w = warrantMap.get(v.warrant_id) || null;
          const inq = inquiryMap.get(v.inquiry_id) || {};
          const trust = computeTrustworthyRate(v.metrics, w);
          const cap = assessCapability(inq.stakes_level, trust, w);
          return { ...v, warrant: w, trust, cap };
        });

        const avg = (key) => (versions.length ? versions.reduce((s, v) => s + (Number(v.metrics?.[key]) || 0), 0) / versions.length : 0);
        const avgTrust = withTrust.length ? Math.round(withTrust.reduce((s, v) => s + v.trust, 0) / withTrust.length) : 0;

        const trend = [...withTrust].reverse().map((v, i) => ({ i: i + 1, trust: v.trust }));

        const metricAvgs = METRIC_DEFS.map((d) => ({
          abbr: d.abbr, label: d.label, lowerBetter: d.lowerBetter, unit: d.unit,
          pct: d.unit === 'sec' ? Math.min(100, (avg(d.key) / 3)) : Math.round(avg(d.key) * 100),
        }));

        const capDist = CAPABILITY_LEVELS.map((c) => ({
          name: c.key, value: withTrust.filter((v) => v.cap.level === c.level).length,
        }));

        const corrBySev = ['minor', 'moderate', 'major', 'critical'].map((sev) => {
          const arr = corrections.filter((c) => c.severity === sev);
          const mttc = arr.length ? Math.round(arr.reduce((s, c) => s + (Number(c.time_to_correction) || 0), 0) / arr.length) : 0;
          return { severity: SEVERITY_STYLES[sev].label, count: arr.length, mttc };
        });

        const avgDrift = corrections.length ? corrections.reduce((s, c) => s + (Number(c.drift_score) || 0), 0) / corrections.length : 0;
        const avgMTTC = corrections.length ? Math.round(corrections.reduce((s, c) => s + (Number(c.time_to_correction) || 0), 0) / corrections.length) : 0;

        const pendingReview = withTrust.filter((v) => v.cap.requiresReview).length;
        const suppressed = withTrust.filter((v) => v.cap.killSwitch).length;
        const healthScore = Math.max(0, Math.min(100, Math.round(avgTrust - avgDrift * 20 - (suppressed / Math.max(1, withTrust.length)) * 15)));

        setData({ count: inquiries.length, versions: withTrust.length, corrections: corrections.length, audits: audits.length, avgTrust, metricAvgs, trend, capDist, corrBySev, avgDrift, avgMTTC, pendingReview, suppressed, healthScore, trendVersions: withTrust });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!data || data.count === 0) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
          <Activity className="h-6 w-6 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No epistemic data yet. Generate warranted answers in the Console to populate the health dashboard.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Epistemic Health</h1>
          <p className="text-sm text-slate-500">Aggregate discipline across all warranted answers, corrections, and drift.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Gauge} label="Health Score" value={`${data.healthScore}`} suffix="/100" accent="emerald" to="/governance" />
          <StatCard icon={ShieldCheck} label="Trustworthy Rate" value={`${data.avgTrust}`} suffix="/100" accent="sky" to="/health" />
          <StatCard icon={Timer} label="Avg MTTC" value={`${data.avgMTTC}s`} accent="amber" to="/health" />
          <StatCard icon={Waves} label="Avg Drift" value={`${Math.round(data.avgDrift * 100)}%`} accent={data.avgDrift > 0.4 ? 'rose' : 'teal'} to="/drift" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Activity} label="Inquiries" value={`${data.count}`} accent="slate" to="/console" />
          <StatCard icon={GitBranch} label="Corrections" value={`${data.corrections}`} accent="indigo" to="/lineage" />
          <StatCard icon={AlertTriangle} label="Pending Review" value={`${data.pendingReview}`} accent="orange" to="/governance" />
          <StatCard icon={AlertTriangle} label="Suppressed" value={`${data.suppressed}`} accent="rose" to="/governance" />
        </div>

        <ChartCard title="Epistemic Trend — Last 30 Days" subtitle="Daily Trustworthy Answer Rate (solid) and key error metrics (dashed, lower is better)">
          <EpistemicTrendChart versions={data.trendVersions} />
        </ChartCard>

        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Trust Trend" subtitle="Trustworthy answer rate over recent answers">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="i" tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} />
                <Line type="monotone" dataKey="trust" stroke="#34D399" strokeWidth={2} dot={{ r: 2, fill: '#34D399' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Capability Distribution" subtitle="Answers by governance gate level">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.capDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {data.capDist.map((_, i) => <Cell key={i} fill={CAP_COLORS[i]} stroke="#0B0F16" />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {data.capDist.map((c, i) => (
                <span key={c.name} className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: CAP_COLORS[i] }} /> {c.name} · {c.value}
                </span>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Metric Averages" subtitle="Mean epistemic metrics across answers">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.metricAvgs} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="abbr" tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                  {data.metricAvgs.map((m, i) => <Cell key={i} fill={m.lowerBetter ? '#38BDF8' : '#34D399'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Correction Economy" subtitle="Corrections by severity & MTTC">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.corrBySev} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="severity" tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Count" fill="#818CF8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mttc" name="Avg MTTC (s)" fill="#FBBF24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}