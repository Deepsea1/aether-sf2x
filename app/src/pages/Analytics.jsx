import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ShieldCheck, ShieldX, AlertTriangle, Loader2, TrendingDown, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import HistoryCharts from '@/components/sf2x/HistoryCharts';

function tone(t) { return t >= 75 ? 'text-emerald-300' : t >= 50 ? 'text-amber-300' : 'text-rose-300'; }

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('your');

  useEffect(() => { base44.auth.me().then((u) => setScope(u?.role === 'admin' ? 'all' : 'your')).catch(() => setScope('your')); }, []);

  const load = useCallback(async () => {
    try {
      const [versions, warrants, reviews, usage, redteam] = await Promise.all([
        base44.entities.AnswerVersion.list('-created_date', 500),
        base44.entities.Warrant.list('-created_date', 500),
        base44.entities.Review.list('-created_date', 200),
        base44.entities.ApiUsage.list('-created_date', 500),
        base44.entities.RedTeamRun.list('-created_date', 200),
      ]);
      const byDay = {};
      let verified = 0, contested = 0, rejected = 0, trustSum = 0, n = 0;
      (versions || []).forEach((v) => {
        const day = (v.created_date || '').slice(0, 10);
        if (!day) return;
        const t = v.trust_score ?? 0;
        byDay[day] = byDay[day] || { day, count: 0, trustSum: 0, rejected: 0 };
        byDay[day].count++; byDay[day].trustSum += t; n++;
        trustSum += t;
        const vs = v.cognitive_state?.verdict || (t >= 75 ? 'verified' : t >= 50 ? 'contested' : 'rejected');
        if (vs === 'verified') verified++;
        else if (vs === 'contested') contested++;
        else { rejected++; byDay[day].rejected++; }
      });
      const trend = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).slice(-30).map((d) => ({ day: d.day.slice(5), trust: d.count ? Math.round(d.trustSum / d.count) : 0, flagged: d.rejected }));
      const gatesTriggered = (reviews || []).filter((r) => r.status === 'killed' || r.status === 'pending').length;
      const suppressed = (reviews || []).filter((r) => r.status === 'killed').length;
      const totalVerifications = n;
      const hallucinationRate = n ? Math.round(((contested + rejected) / n) * 100) : 0;
      const avgTrust = n ? Math.round(trustSum / n) : 0;
      const creditsUsed = (usage || []).reduce((s, u) => s + (Number(u.credits) || 0), 0);
      const redteamResisted = (redteam || []).filter((r) => r.outcome === 'resisted').length;
      // ROI: estimated risk avoided = hallucinated verifications × assumed cost per incident ($50)
      const riskAvoided = (contested + rejected) * 50;
      setData({ totalVerifications, verified, contested, rejected, hallucinationRate, avgTrust, gatesTriggered, suppressed, creditsUsed, redteamResisted, riskAvoided, trend, warrantCount: (warrants || []).length });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <AppShell><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 text-emerald-400 animate-spin" /></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><BarChart3 className="h-3.5 w-3.5" /> Analytics & ROI</div>
          <h1 className="font-heading text-xl font-semibold text-white">The business case for the truth layer</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">How often your AI was wrong, what Aether caught, and the risk it avoided. This is the dashboard you show procurement.</p>
          <div className={`mt-3 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${scope === 'all' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/5 text-slate-400'}`}>
            {scope === 'all' ? 'Admin view — all users' : 'Showing your analytics only'}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={ShieldCheck} label="Verifications" value={data.totalVerifications} accent="emerald" sub={`${data.verified} verified`} to="/verification-history" />
          <Stat icon={AlertTriangle} label="Hallucination rate" value={`${data.hallucinationRate}%`} accent="amber" sub={`${data.contested + data.rejected} flagged`} to="/health" />
          <Stat icon={ShieldX} label="Gates triggered" value={data.gatesTriggered} accent="rose" sub={`${data.suppressed} suppressed`} to="/governance" />
          <Stat icon={DollarSign} label="Risk avoided" value={`$${data.riskAvoided.toLocaleString()}`} accent="emerald" sub="est. @ $50/incident" to="/cost-analysis" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={BarChart3} label="Avg trust" value={data.avgTrust} accent="slate" to="/health" />
          <Stat icon={ShieldX} label="Red-team resisted" value={data.redteamResisted} accent="emerald" to="/collective" />
          <Stat icon={ShieldCheck} label="Warrants issued" value={data.warrantCount} accent="slate" to="/lineage" />
          <Stat icon={TrendingDown} label="Credits used" value={data.creditsUsed} accent="slate" to="/api-usage" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white">Full history — all verifications</div>
          <div className="text-[11px] text-slate-500 mb-4">Every answer, warrant, correction, and red-team run — full history, no 30-day cap. Use the side tabs to switch metrics.</div>
          <HistoryCharts />
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, sub, accent, to }) {
  const map = { emerald: 'text-emerald-300 bg-emerald-400/10', amber: 'text-amber-300 bg-amber-400/10', rose: 'text-rose-300 bg-rose-400/10', slate: 'text-slate-300 bg-white/5' };
  const cls = map[accent] || map.slate;
  const inner = (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03] h-full">
      <div className="flex items-center gap-2 mb-2"><span className={`h-8 w-8 rounded-lg flex items-center justify-center ${cls}`}><Icon className="h-4 w-4" /></span><span className="text-[11px] text-slate-500 leading-tight">{label}</span></div>
      <div className="text-2xl font-semibold text-white leading-none">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}