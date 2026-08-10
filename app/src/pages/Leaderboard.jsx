import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { Loader2, ExternalLink, Trophy, Crown, Sparkles, ChevronRight, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ALL_MODELS } from '@/lib/sf2xBench';
import { isDailyTrackedModel } from '@/lib/sf2xCompanies';
import CompanyBadge from '@/components/sf2x/CompanyBadge';
import ModelAnswerDetail from '@/components/sf2x/ModelAnswerDetail';

const MEDALS = ['🥇', '🥈', '🥉'];
const COMPANY = new Map(ALL_MODELS.map((m) => [m.value, m.tag]));

function toneFor(t) {
  if (t >= 80) return { text: 'text-emerald-300', ring: 'ring-emerald-400/40' };
  if (t >= 60) return { text: 'text-amber-300', ring: 'ring-amber-400/40' };
  return { text: 'text-rose-300', ring: 'ring-rose-400/40' };
}

export function LeaderboardContent() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const runs = await base44.entities.ModelBenchRun.list('-created_date', 500);
        const byModel = {};
        runs.forEach((r) => {
          const key = r.model;
          if (!byModel[key]) {
            byModel[key] = { model: r.model, label: r.model_label || r.model, company: COMPANY.get(r.model) || '—', wins: 0, total: 0, trustSum: 0, corrSum: 0, corrCount: 0, latSum: 0, latCount: 0, lastDate: r.question_date || '', latestRun: null };
          }
          const m = byModel[key];
          m.total++;
          if (r.is_winner) m.wins++;
          m.trustSum += r.trust_score || 0;
          if (r.correctness != null) { m.corrSum += r.correctness; m.corrCount++; }
          if (r.latency_ms != null && !r.error) { m.latSum += r.latency_ms; m.latCount++; }
          if (r.question_date && r.question_date > m.lastDate) m.lastDate = r.question_date;
          if (!m.latestRun && !r.error && r.answer_text) m.latestRun = r;
        });
        const ranked = Object.values(byModel).map((m) => ({
          ...m,
          winRate: m.total ? m.wins / m.total : 0,
          avgTrust: m.total ? Math.round(m.trustSum / m.total) : 0,
          avgCorrectness: m.corrCount ? m.corrSum / m.corrCount : null,
          avgLatency: m.latCount ? Math.round(m.latSum / m.latCount) : null,
        })).sort((a, b) => b.winRate - a.winRate || (b.avgCorrectness ?? -1) - (a.avgCorrectness ?? -1));
        setRows(ranked);
      } catch (e) {
        setErr(e?.message || 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalRuns = rows.reduce((s, r) => s + r.total, 0);
  // One entry per company — its highest-ranked model.
  const display = useMemo(() => {
    const seen = new Set();
    return rows.filter((r) => { if (seen.has(r.company)) return false; seen.add(r.company); return true; });
  }, [rows]);
  // Daily-tracked models (run every day by the arena) grouped above on-demand ones.
  const dailyRows = display.filter((r) => isDailyTrackedModel(r.model));
  const otherRows = display.filter((r) => !isDailyTrackedModel(r.model));
  // Champion must be a daily-tracked model (robust sample) — or, if none exist
  // yet, a model with at least 3 runs. Never crown a single-run on-demand
  // model "champion" just because it happened to win once.
  const champ = dailyRows[0] || display.find((r) => r.total >= 3) || null;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <header className="flex items-center gap-3 mb-8">
          <div className="relative">
            <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" />
            <div className="relative h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="font-heading text-lg font-semibold text-white">AETHER Bench · Public Leaderboard</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">An awareness benchmark, not product validation</div>
          </div>
        </header>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4 mb-6 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            This arena is a <span className="text-amber-200">public awareness artifact</span>, not evidence that SF2X works. "Most pressing AI/tech question of the day" generates a vanity ranking — it is fine for visibility but does not validate our trust layer. The falsifiable evidence for SF2X lives in the <Link to="/methodology" className="text-emerald-300 underline-offset-2 hover:underline">published audits on the Methodology page</Link> (benchmark correlation + tribunal-vs-single lift on hard questions). Treat this board as entertainment; treat those as evidence.
          </p>
        </div>

        <p className="text-xs text-slate-500 mb-3">One entry per company — its highest-ranked model — judged head-to-head on the same question by the AETHER verifier. Tap a row to inspect the answer, or open the full audit trail.</p>

        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3 mb-6 flex items-start gap-2.5">
          <Sparkles className="h-3.5 w-3.5 text-emerald-300 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <span className="text-emerald-300 font-medium">Daily-tracked models</span> (the top group) are run automatically every day by the arena, so they have far more logged runs. <span className="text-slate-300">On-demand models</span> below the divider only run when you trigger them — their win rates are based on a much smaller sample and aren't directly comparable.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && err && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] p-5 text-sm text-rose-200">{err}</div>
        )}

        {!loading && !err && (
          <>
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                <Sparkles className="h-5 w-5 text-slate-500 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No arena runs yet. The daily arena will populate this board automatically.</p>
              </div>
            ) : (
              <>
                {champ && (
                  <div className={`rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400/[0.08] via-white/[0.02] to-transparent p-6 mb-6 ring-1 ${toneFor(champ.avgTrust).ring}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Crown className="h-4 w-4 text-emerald-300" />
                      <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Reigning champion</span>
                      {isDailyTrackedModel(champ.model) && <span className="text-[9px] uppercase tracking-wider text-emerald-300/70 bg-emerald-400/10 px-1.5 py-0.5 rounded">daily-tracked</span>}
                      <span className="ml-1"><CompanyBadge company={champ.company} /></span>
                    </div>
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                      <div>
                        <div className="font-heading text-2xl font-semibold text-white">{champ.label}</div>
                        <div className="text-xs text-slate-500 mt-1">{Math.round(champ.winRate * 100)}% win rate · {champ.total} run{champ.total === 1 ? '' : 's'} · {champ.avgCorrectness != null ? Math.round(champ.avgCorrectness * 100) + '% avg correct' : '—'} · {champ.avgLatency != null ? champ.avgLatency + 'ms avg' : '—'} · last {champ.lastDate || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-semibold text-emerald-300 tabular-nums leading-none">{Math.round(champ.winRate * 100)}%</div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mt-1">Win rate</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                          <th className="text-left font-medium px-4 py-2.5">#</th>
                          <th className="text-left font-medium px-4 py-2.5">Model</th>
                          <th className="text-left font-medium px-4 py-2.5">Company</th>
                          <th className="text-right font-medium px-4 py-2.5">Win rate</th>
                          <th className="text-right font-medium px-4 py-2.5">Wins</th>
                          <th className="text-right font-medium px-4 py-2.5">Correctness</th>
                          <th className="text-right font-medium px-4 py-2.5">Trust</th>
                          <th className="text-right font-medium px-4 py-2.5">Latency</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let rank = 0;
                          const rows = [];
                          const renderRow = (r, groupTag) => {
                            const i = rank++;
                            rows.push(
                              <React.Fragment key={r.model}>
                                <tr
                                  onClick={() => setExpanded(expanded === r.model ? null : r.model)}
                                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer"
                                >
                                  <td className="px-4 py-3 text-slate-500">{MEDALS[i] || i + 1}</td>
                                  <td className="px-4 py-3 text-slate-200 font-medium">
                                    <Link to={`/bench/model/${r.model}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-300">{r.label}</Link>
                                  </td>
                                  <td className="px-4 py-3"><CompanyBadge company={r.company} /></td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`font-semibold ${r.winRate >= 0.6 ? 'text-emerald-300' : r.winRate >= 0.3 ? 'text-amber-300' : 'text-slate-400'}`}>{Math.round(r.winRate * 100)}%</span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-slate-400">{r.wins}/{r.total}</td>
                                  <td className="px-4 py-3 text-right text-slate-400">{r.avgCorrectness != null ? r.avgCorrectness.toFixed(2) : '—'}</td>
                                  <td className={`px-4 py-3 text-right ${toneFor(r.avgTrust).text}`}>{r.avgTrust}</td>
                                  <td className="px-4 py-3 text-right text-slate-400">{r.avgLatency != null ? r.avgLatency + 'ms' : '—'}</td>
                                  <td className="px-2 py-3 text-slate-600">
                                    <ChevronRight className={`h-4 w-4 transition-transform ${expanded === r.model ? 'rotate-90' : ''}`} />
                                  </td>
                                </tr>
                                {expanded === r.model && (
                                  <tr>
                                    <td colSpan={9} className="px-4 pb-4 pt-1">
                                      <div className="rounded-xl border border-white/10 bg-[#070A0F] p-4">
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-[11px] text-slate-500">Most recent answer · {r.lastDate || '—'}</span>
                                          <CompanyBadge company={r.company} />
                                        </div>
                                        <ModelAnswerDetail run={r.latestRun} />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          };
                          dailyRows.forEach((r) => renderRow(r, 'daily'));
                          if (otherRows.length) {
                            rows.push(
                              <tr key="sep-other" className="bg-white/[0.02]">
                                <td colSpan={9} className="px-4 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="h-px flex-1 bg-white/10" />
                                    <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">On-demand only · fewer runs, not directly comparable</span>
                                    <span className="h-px flex-1 bg-white/10" />
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          otherRows.forEach((r) => renderRow(r, 'other'));
                          return rows;
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] text-slate-600">{totalRuns} arena run{totalRuns === 1 ? '' : 's'} scored by the AETHER verifier.</p>
                  <a href="/" className="text-xs text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1">
                    Get a warranted answer <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </>
            )}
          </>
        )}
      </div>
  );
}

export default function Leaderboard() {
  return <div className="min-h-screen bg-[#070A0F] text-slate-200"><PublicNav /><LeaderboardContent /></div>;
}