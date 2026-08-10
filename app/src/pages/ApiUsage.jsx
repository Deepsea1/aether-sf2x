import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3, Loader2, KeyRound, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';

export default function ApiUsage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [keys, usage, versions] = await Promise.all([
        base44.entities.ApiKey.list('-created_date', 50),
        base44.entities.ApiUsage.list('-created_date', 500),
        base44.entities.AnswerVersion.list('-created_date', 500),
      ]);
      const myVersions = (versions || []);
      const verified = myVersions.filter((v) => (v.cognitive_state?.source || '').includes('verify') || v.trust_score != null);
      const total = verified.length;
      const byDay = {};
      let trustSum = 0;
      const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
      const flaggedClaims = {};
      verified.forEach((v) => {
        const day = (v.created_date || '').slice(0, 10);
        if (day) { byDay[day] = byDay[day] || { day: day.slice(5), trust: 0, n: 0 }; byDay[day].trust += v.trust_score || 0; byDay[day].n++; }
        trustSum += v.trust_score || 0;
        const b = v.trust_score <= 20 ? '0-20' : v.trust_score <= 40 ? '21-40' : v.trust_score <= 60 ? '41-60' : v.trust_score <= 80 ? '61-80' : '81-100';
        buckets[b]++;
        const corr = v.cognitive_state?.corrections || v.cognitive_state?.verifier_notes;
        if (Array.isArray(corr)) corr.forEach((c) => { const k = String(c).slice(0, 60); flaggedClaims[k] = (flaggedClaims[k] || 0) + 1; });
      });
      const trend = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).slice(-14).map((d) => ({ day: d.day, trust: d.n ? Math.round(d.trust / d.n) : 0 }));
      const dist = Object.entries(buckets).map(([range, count]) => ({ range, count }));
      const topClaims = Object.entries(flaggedClaims).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([claim, count]) => ({ claim, count }));
      const credits = (usage || []).reduce((s, u) => s + (Number(u.credits) || 0), 0);
      const byEndpoint = {};
      (usage || []).forEach((u) => { byEndpoint[u.endpoint] = (byEndpoint[u.endpoint] || 0) + (Number(u.credits) || 0); });
      const byTier = Object.entries(byEndpoint).map(([endpoint, c]) => ({ endpoint, credits: c }));
      setData({ total, avgTrust: total ? Math.round(trustSum / total) : 0, trend, dist, topClaims, credits, keys: keys?.length || 0, byTier });
    } catch (e) { /* */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <AppShell><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 text-emerald-400 animate-spin" /></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><BarChart3 className="h-3.5 w-3.5" /> API Usage</div>
          <h1 className="font-heading text-xl font-semibold text-white">Your verification usage</h1>
          <p className="text-sm text-slate-500 mt-1.5">How many answers you've verified, your trust-score trend, the claims Aether flags most, and where your credits go.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={ShieldCheck} label="Verifications" value={data.total} />
          <Stat icon={TrendingUp} label="Avg trust" value={data.avgTrust} />
          <Stat icon={KeyRound} label="API keys" value={data.keys} />
          <Stat icon={AlertTriangle} label="Credits used" value={data.credits} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white mb-1">Trust score trend</div>
          <div className="text-[11px] text-slate-500 mb-4">Daily average trust across your verifications.</div>
          {data.trend.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="trust" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="text-sm text-slate-500 py-10 text-center">No verifications yet.</div>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white mb-1">Trust score distribution</div>
          <div className="text-[11px] text-slate-500 mb-4">How your verifications spread across trust bands.</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dist} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <div className="text-sm font-medium text-white mb-3">Most flagged claims</div>
            {data.topClaims.length ? (
              <ul className="space-y-2">{data.topClaims.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px]"><span className="text-rose-300 font-semibold w-6">{c.count}×</span><span className="text-slate-400 truncate">{c.claim}</span></li>
              ))}</ul>
            ) : <div className="text-[12px] text-slate-600">No flagged claims yet.</div>}
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <div className="text-sm font-medium text-white mb-3">Usage by endpoint</div>
            {data.byTier.length ? (
              <ul className="space-y-2">{data.byTier.map((t, i) => (
                <li key={i} className="flex items-center justify-between text-[12px]"><span className="text-slate-400 capitalize">{t.endpoint}</span><span className="text-slate-300">{t.credits} credits</span></li>
              ))}</ul>
            ) : <div className="text-[12px] text-slate-600">No metered calls yet.</div>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="flex items-center gap-2 mb-2"><span className="h-8 w-8 rounded-lg flex items-center justify-center text-emerald-300 bg-emerald-400/10"><Icon className="h-4 w-4" /></span><span className="text-[11px] text-slate-500">{label}</span></div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}