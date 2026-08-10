import React, { useEffect, useState } from 'react';
import { Calendar, Trophy, AlertTriangle, TrendingDown, Activity, Loader2 } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

function monthLabel(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function MonthlyReport() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  useEffect(() => {
    (async () => {
      try {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const data = await base44.entities.ModelBenchRun.filter({ question_date: { $gte: monthStart } }, '-created_date', 200);
        setRuns(data || []);
      } catch { setRuns([]); }
      finally { setLoading(false); }
    })();
  }, []);

  // Aggregate by model
  const byModel = {};
  (runs || []).forEach(r => {
    const key = r.model_label || r.model || 'unknown';
    if (!byModel[key]) byModel[key] = { count: 0, trustSum: 0, correctSum: 0, correctCount: 0, worstTrust: 100, worstText: '' };
    byModel[key].count++;
    byModel[key].trustSum += r.trust_score || 0;
    if (r.correctness != null) { byModel[key].correctSum += r.correctness; byModel[key].correctCount++; }
    if ((r.trust_score || 100) < byModel[key].worstTrust) {
      byModel[key].worstTrust = r.trust_score || 0;
      byModel[key].worstText = r.answer_text || '';
    }
  });

  const modelStats = Object.entries(byModel).map(([name, s]) => ({
    name, count: s.count,
    avgTrust: s.count ? Math.round(s.trustSum / s.count) : 0,
    avgCorrectness: s.correctCount ? (s.correctSum / s.correctCount) : null,
    worstTrust: Math.round(s.worstTrust),
    worstText: s.worstText,
  })).sort((a, b) => a.avgTrust - b.avgTrust);

  const worstHallucinations = [...(runs || [])].sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0)).slice(0, 5);
  const domainCounts = {};
  (runs || []).forEach(r => { const d = (r.metrics?.domain) || 'General'; domainCounts[d] = (domainCounts[d] || 0) + 1; });

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <Calendar className="h-3.5 w-3.5" /> Monthly Report
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">
            AI Hallucination Report
          </h1>
          <p className="mt-3 text-lg text-slate-400">{monthLabel(now)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {runs.length} benchmarked answers across {modelStats.length} models this month.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 text-emerald-400 animate-spin" /></div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-12 text-center">
            <Activity className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No benchmark runs yet this month. Run the daily arena to populate this report.</p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-2xl font-heading font-bold text-white">{runs.length}</div>
                <div className="text-xs text-slate-500 mt-0.5">Answers Benchmarked</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-2xl font-heading font-bold text-white">{modelStats.length}</div>
                <div className="text-xs text-slate-500 mt-0.5">Models Tested</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-2xl font-heading font-bold text-rose-300">{modelStats.filter(m => m.avgTrust < 50).length}</div>
                <div className="text-xs text-slate-500 mt-0.5">High-Risk Models</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-2xl font-heading font-bold text-emerald-300">{Object.keys(domainCounts).length}</div>
                <div className="text-xs text-slate-500 mt-0.5">Domains Covered</div>
              </div>
            </div>

            {/* Worst-performing models */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-5 w-5 text-rose-400" />
                <h2 className="text-lg font-heading font-semibold text-white">Worst-Performing Models</h2>
              </div>
              <div className="space-y-3">
                {modelStats.slice(0, 5).map((m, i) => (
                  <div key={m.name} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 flex items-center gap-4">
                    <span className="text-lg font-heading font-bold text-slate-600 w-6">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.count} answers · avg correctness {m.avgCorrectness != null ? Math.round(m.avgCorrectness * 100) + '%' : '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-heading font-bold ${m.avgTrust < 40 ? 'text-rose-300' : m.avgTrust < 60 ? 'text-amber-300' : 'text-emerald-300'}`}>{m.avgTrust}</div>
                      <div className="text-xs text-slate-600">avg trust</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top hallucinations */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-heading font-semibold text-white">Top Hallucinations This Month</h2>
              </div>
              <div className="space-y-3">
                {worstHallucinations.map((h, i) => (
                  <div key={h.id || i} className="rounded-xl border border-rose-400/15 bg-rose-400/[0.02] p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-xs font-mono text-slate-500 shrink-0">trust {h.trust_score || 0}</span>
                      <span className="text-xs text-slate-400">{h.model_label || h.model}</span>
                    </div>
                    <p className="text-sm text-slate-300 line-clamp-3">{h.question}</p>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">→ {h.answer_text || '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain breakdown */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-heading font-semibold text-white">Domain Breakdown</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(domainCounts).map(([domain, count]) => (
                  <div key={domain} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 text-center">
                    <div className="text-2xl font-heading font-bold text-white">{count}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{domain}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}