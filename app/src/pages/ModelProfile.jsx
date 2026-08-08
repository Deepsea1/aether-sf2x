import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Crown, Clock, Trophy, ExternalLink, ChevronLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { ALL_MODELS } from '@/lib/sf2xBench';
import CompanyBadge from '@/components/sf2x/CompanyBadge';
import { COMPANY_OF_MODEL, companyMeta } from '@/lib/sf2xCompanies';
import RatingKey from '@/components/sf2x/RatingKey';

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-100 mt-1 tabular-nums">{value}</div>
    </div>
  );
}

export default function ModelProfile() {
  const { model } = useParams();
  const meta = ALL_MODELS.find((m) => m.value === model);
  const company = meta?.tag || COMPANY_OF_MODEL.get(model) || '—';
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.ModelBenchRun.list('-created_date', 500);
        setRuns((all || []).filter((r) => r.model === model));
      } catch {
        setRuns([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [model]);

  const ok = runs.filter((r) => !r.error);
  const wins = ok.filter((r) => r.is_winner).length;
  const winRate = ok.length ? Math.round((wins / ok.length) * 100) : 0;
  const avgTrust = ok.length ? Math.round(ok.reduce((s, r) => s + (r.trust_score || 0), 0) / ok.length) : 0;
  const corrRuns = ok.filter((r) => r.correctness != null);
  const avgCorr = corrRuns.length ? Math.round((corrRuns.reduce((s, r) => s + r.correctness, 0) / corrRuns.length) * 100) : null;
  const latRuns = ok.filter((r) => r.latency_ms != null);
  const avgLat = latRuns.length ? Math.round(latRuns.reduce((s, r) => s + r.latency_ms, 0) / latRuns.length) : null;
  const wvRuns = ok.filter((r) => r.warrant_summary?.validity);
  const wv = wvRuns.length ? Math.round((wvRuns.filter((r) => r.warrant_summary.validity === 'valid').length / wvRuns.length) * 100) : null;

  const trend = useMemo(() => {
    const byDate = new Map();
    ok.forEach((r) => {
      const d = r.question_date || (r.created_date || '').slice(0, 10);
      if (!d) return;
      if (!byDate.has(d)) byDate.set(d, { sum: 0, count: 0 });
      byDate.get(d).sum += r.trust_score || 0;
      byDate.get(d).count += 1;
    });
    return [...byDate.keys()].sort().map((d) => ({ date: d, trust: Math.round(byDate.get(d).sum / byDate.get(d).count) }));
  }, [ok]);

  return (
    <AppShell>
      <div className="space-y-5">
        <Link to="/bench" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Bench
        </Link>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CompanyBadge company={company} size="lg" />
                {winRate >= 50 && ok.length > 0 && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Crown className="h-3 w-3" /> top performer
                  </span>
                )}
              </div>
              <h1 className="font-heading text-2xl font-semibold text-white">{meta?.label || model}</h1>
              <p className="text-xs text-slate-500 mt-1">{company} · {ok.length} scored run{ok.length === 1 ? '' : 's'}</p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-semibold leading-none text-emerald-300 tabular-nums">{winRate}<span className="text-lg text-slate-600">%</span></div>
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Win rate</div>
              <RatingKey label="How to read scores" className="mt-1.5" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Wins" value={`${wins}/${ok.length}`} />
            <Stat label="Avg trust" value={`${avgTrust}`} />
            <Stat label="Avg correct" value={avgCorr != null ? `${avgCorr}%` : '—'} />
            <Stat label="Warrant valid" value={wv != null ? `${wv}%` : '—'} />
          </div>
          {avgLat != null && <p className="mt-3 text-[11px] text-slate-500">Avg latency {avgLat}ms</p>}
        </div>

        {trend.length > 1 && (
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Trust trend</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(d) => d.slice(5)} stroke="rgba(255,255,255,0.08)" />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" width={40} />
                  <Tooltip contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="trust" stroke={companyMeta(company).color} strokeWidth={2.5} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-200">Run history · audit trail</h3>
            <span className="text-[11px] text-slate-500">— every answer, warrant, and verifier note</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>
          ) : runs.length === 0 ? (
            <p className="text-xs text-slate-600 py-10 text-center">No runs logged for this model yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {runs.map((r) => (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono text-slate-400">{r.question_date || '—'} · {r.run_type}</span>
                    <div className="flex items-center gap-1.5">
                      {r.is_winner && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.error ? 'bg-rose-400/10 text-rose-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
                        {r.error ? 'failed' : `trust ${Math.round(r.trust_score || 0)}`}
                      </span>
                      {r.correctness != null && <span className="text-[10px] text-slate-500">{Math.round(r.correctness * 100)}% correct</span>}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 italic mb-2 line-clamp-1">"{r.question}"</p>
                  {r.error ? (
                    <p className="text-xs text-rose-300/80">{r.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap line-clamp-6">{r.answer_text}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                        {r.latency_ms != null && <span>latency {r.latency_ms}ms</span>}
                        {r.warrant_summary?.validity && (
                          <span>warrant {r.warrant_summary.validity} · {r.warrant_summary.premises} premises · {r.warrant_summary.sources} sources</span>
                        )}
                      </div>
                      {r.verifier_notes && (
                        <p className="mt-1.5 text-[11px] text-slate-400"><span className="text-slate-600">verifier:</span> {r.verifier_notes}</p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link to="/leaderboard" className="text-xs text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> Full leaderboard <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}