import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, DollarSign, BarChart3, TrendingUp, ShieldX, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Compact epistemic header strip — a thin, single-row summary of the key
// trust/usage metrics + a 30-day trust sparkline, sized to sit like a header
// bar at the top of the Ask page.
export default function AskStats() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const [versions, usage, redteam, warrants] = await Promise.all([
        base44.entities.AnswerVersion.list('-created_date', 500),
        base44.entities.ApiUsage.list('-created_date', 500),
        base44.entities.RedTeamRun.list('-created_date', 200),
        base44.entities.Warrant.list('-created_date', 500),
      ]);
      const byDay = {};
      let verified = 0, contested = 0, rejected = 0, trustSum = 0, n = 0;
      (versions || []).forEach((v) => {
        const day = (v.created_date || '').slice(0, 10);
        if (!day) return;
        const t = v.trust_score ?? 0;
        byDay[day] = byDay[day] || { day, count: 0, trustSum: 0 };
        byDay[day].count++; byDay[day].trustSum += t; n++; trustSum += t;
        const vs = v.cognitive_state?.verdict || (t >= 75 ? 'verified' : t >= 50 ? 'contested' : 'rejected');
        if (vs === 'verified') verified++;
        else if (vs === 'contested') contested++;
        else rejected++;
      });
      const trend = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).slice(-30)
        .map((d) => ({ day: d.day.slice(5), trust: d.count ? Math.round(d.trustSum / d.count) : 0 }));
      const credits = (usage || []).reduce((s, u) => s + (Number(u.credits) || 0), 0);
      const hallucinationRate = n ? Math.round(((contested + rejected) / n) * 100) : 0;
      const avgTrust = n ? Math.round(trustSum / n) : 0;
      const redteamResisted = (redteam || []).filter((r) => r.outcome === 'resisted').length;
      setData({
        total: n, verified, contested, rejected, hallucinationRate, avgTrust, credits,
        riskAvoided: (contested + rejected) * 50, redteamResisted, warrantCount: (warrants || []).length, trend,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-2 mb-4">
        <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const stats = [
    { icon: ShieldCheck, label: 'Verifications', value: data.total, accent: 'emerald', to: '/verification-history' },
    { icon: AlertTriangle, label: 'Hallucination', value: `${data.hallucinationRate}%`, accent: 'amber', to: '/health' },
    { icon: DollarSign, label: 'Risk avoided', value: `$${data.riskAvoided.toLocaleString()}`, accent: 'emerald', to: '/cost-analysis' },
    { icon: BarChart3, label: 'Credits', value: data.credits, accent: 'slate', to: '/api-usage' },
    { icon: TrendingUp, label: 'Avg trust', value: data.avgTrust, accent: 'slate', to: '/health' },
    { icon: ShieldX, label: 'Red-team', value: data.redteamResisted, accent: 'emerald', to: '/collective' },
    { icon: ShieldCheck, label: 'Warrants', value: data.warrantCount, accent: 'slate', to: '/lineage' },
  ];

  return (
    <div className="mb-4 flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-white/10 bg-[#0B0F16] px-2 py-1.5">
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className="h-5 w-px bg-white/10 shrink-0" />}
          <Link to={s.to} className="flex items-center gap-1.5 shrink-0 px-1.5 py-0.5 rounded-md hover:bg-white/5 transition-colors">
            <s.icon className={`h-3.5 w-3.5 ${ACCENT[s.accent] || ACCENT.slate}`} />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</span>
            <span className="text-xs font-semibold text-white">{s.value}</span>
          </Link>
        </React.Fragment>
      ))}
      <span className="h-5 w-px bg-white/10 shrink-0" />
      <div className="flex items-center gap-1.5 shrink-0 px-1.5 py-0.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Trust · 30d</span>
        <div className="h-7 w-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend} margin={{ top: 1, right: 0, bottom: 0, left: 0 }}>
              <Line type="monotone" dataKey="trust" stroke="#34d399" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const ACCENT = { emerald: 'text-emerald-300', amber: 'text-amber-300', rose: 'text-rose-300', slate: 'text-slate-300' };