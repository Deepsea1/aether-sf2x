import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Award, ShieldCheck, Trophy, BarChart3, Gauge, CheckCircle2, ExternalLink, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/sf2x/StatCard';
import ModelArena from '@/components/sf2x/ModelArena';
import ModelTrendChart from '@/components/sf2x/ModelTrendChart';
import RatingKey from '@/components/sf2x/RatingKey';
import { computeBenchScore } from '@/lib/sf2xCollective';
import { computeTrustworthyRate } from '@/lib/sf2x';
import AgentGreeter from '@/components/sf2x/AgentGreeter';
import TrustDisclosureBanner from '@/components/sf2x/TrustDisclosureBanner';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Bench() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.BenchResult.list('-bench_score', 100);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function scoreDeployment() {
    setBusy(true);
    try {
      const [versions, warrants, corrections, redRuns] = await Promise.all([
        base44.entities.AnswerVersion.list('-created_date', 500),
        base44.entities.Warrant.list('-created_date', 500),
        base44.entities.CorrectionEvent.list('-created_date', 500),
        base44.entities.RedTeamRun.list('-created_date', 500),
      ]);
      const wMap = new Map(warrants.map((w) => [w.id, w]));
      const withW = versions.map((v) => ({ ...v, warrant: wMap.get(v.warrant_id) }));
      const warrant_rate = versions.length ? withW.filter((v) => v.warrant && v.warrant.validity_status === 'valid').length / versions.length : 0;
      const trustAvg = withW.length ? withW.reduce((s, v) => s + computeTrustworthyRate(v.metrics, v.warrant), 0) / withW.length : 0;
      const correction_rate = versions.length ? versions.reduce((s, v) => s + (Number(v.metrics?.correction_rate) || 0), 0) / versions.length : 0;
      const mttc = corrections.length ? corrections.reduce((s, c) => s + (Number(c.time_to_correction) || 0), 0) / corrections.length : 0;
      const resistance_rate = redRuns.length ? redRuns.filter((r) => r.outcome === 'resisted').length / redRuns.length : 0;
      const drift_score = corrections.length ? corrections.reduce((s, c) => s + (Number(c.drift_score) || 0), 0) / corrections.length : 0;
      const bench_score = computeBenchScore({ warrant_rate, trustworthy_rate: trustAvg, correction_rate, mean_time_to_correction: mttc, resistance_rate, drift_score });
      const certified = bench_score >= 75 && warrant_rate >= 0.9 && resistance_rate >= 0.8;

      const rec = await base44.entities.BenchResult.create({
        system_name: 'SF2X (this deployment)', domain: 'multi',
        warrant_rate, trustworthy_rate: Math.round(trustAvg), correction_rate,
        mean_time_to_correction: Math.round(mttc), resistance_rate, drift_score,
        bench_score, certified,
      });
      await base44.entities.AuditLog.create({
        event_type: 'answer_promoted', entity_type: 'BenchResult', entity_id: rec.id,
        summary: `SF2X Bench scored ${bench_score}${certified ? ' · SF2X-Verified' : ''}`,
        metadata: { bench_score, certified },
      }).catch(() => {});
      await load();
    } catch {
      /* scoring failed */
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const top = rows[0];
  // Only real, measured BenchResult rows — no fabricated reference scores.
  const chartData = rows.map((r) => ({ name: r.system_name, score: r.bench_score, certified: r.certified, hl: r.certified }));

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400/[0.07] via-white/[0.02] to-transparent p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full">Benchmark</span>
                {top?.certified ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/30">
                    <CheckCircle2 className="h-3 w-3" /> SF2X-Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">Uncertified</span>
                )}
              </div>
              <h1 className="font-heading text-2xl font-semibold text-white">SF2X Bench</h1>
              <p className="text-sm text-slate-400 mt-1.5">
                Epistemic-discipline benchmark leaderboard. Every deployment is scored on warrant coverage, trust, correction speed, and red-team resistance — and certified once it clears the bar.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> {rows.length} result{rows.length === 1 ? '' : 's'} on the board</span>
                {top?.created_date && <span>· last scored {new Date(top.created_date).toLocaleDateString()}</span>}
                <Link to="/leaderboard" target="_blank" className="inline-flex items-center gap-1 hover:text-emerald-300 ml-auto">
                  <ExternalLink className="h-3.5 w-3.5" /> Public leaderboard
                </Link>
                <AgentGreeter
                  agentKey="tribunal_lift_audit"
                  to="/tribunal-lift"
                  firstGreeting="Hi! I'm the Tribunal Lift assistant. I measure how much the multi-model tribunal improves trust and correctness over a single AI. Click below and ask me to run an audit, or paste an AI output to evaluate."
                  returningGreeting="I'm here if you want to run a tribunal lift audit."
                  label="Tribunal lift assistant"
                />
              </div>
            </div>
            <div className="flex items-center gap-6 self-start lg:self-auto">
              <div className="text-center">
                <div className="text-5xl font-semibold leading-none text-emerald-300 tabular-nums">{top ? top.bench_score : '—'}</div>
                <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Composite / 100</div>
                <RatingKey label="How to read scores" className="mt-1.5" />
              </div>
              <Button onClick={scoreDeployment} disabled={busy}
                className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />} Score this deployment
              </Button>
            </div>
          </div>
        </div>

        <TrustDisclosureBanner />

        <ModelArena />

        {top && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Trophy} label="Top score" value={`${top.bench_score}`} suffix="/100" accent="emerald" />
            <StatCard icon={ShieldCheck} label="Warrant rate" value={`${Math.round((top.warrant_rate || 0) * 100)}%`} accent="sky" />
            <StatCard icon={Award} label="Resistance" value={`${Math.round((top.resistance_rate || 0) * 100)}%`} accent="amber" />
            <StatCard icon={ShieldCheck} label="Certified" value={rows.filter((r) => r.certified).length} accent={rows.some((r) => r.certified) ? 'emerald' : 'rose'} />
          </div>
        )}

        <ModelTrendChart />

        {/* Bench scores — measured deployments only */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-200">Bench scores — measured deployments</h3>
          </div>
          {chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-sm text-slate-500">No scored deployments yet.</div>
          ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} formatter={(v) => [`${v}/100`, 'Bench score']} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={26}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.certified ? '#34d399' : '#475569'} />
                  ))}
                  <LabelList dataKey="score" position="right" style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-10 text-center">
              <Trophy className="h-5 w-5 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No benchmarks yet. Score this deployment to put SF2X on the board.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                  <th className="text-left font-medium px-4 py-2.5">#</th>
                  <th className="text-left font-medium px-4 py-2.5">System</th>
                  <th className="text-right font-medium px-4 py-2.5">Warrant</th>
                  <th className="text-right font-medium px-4 py-2.5">Trust</th>
                  <th className="text-right font-medium px-4 py-2.5">Resist</th>
                  <th className="text-right font-medium px-4 py-2.5">Score</th>
                  <th className="text-center font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-slate-500">{MEDALS[i] || i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200 font-medium">{r.system_name}</div>
                      <div className="text-[11px] text-slate-600">{r.domain}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{Math.round((r.warrant_rate || 0) * 100)}%</td>
                    <td className="px-4 py-3 text-right text-slate-400">{r.trustworthy_rate ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{Math.round((r.resistance_rate || 0) * 100)}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${r.bench_score >= 75 ? 'text-emerald-300' : r.bench_score >= 50 ? 'text-amber-300' : 'text-rose-300'}`}>{r.bench_score}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.certified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}