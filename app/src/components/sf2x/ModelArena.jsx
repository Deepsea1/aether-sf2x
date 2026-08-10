import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Swords, Crown, Sparkles, Trophy, History, CalendarClock, CheckSquare, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ALL_MODELS, DEFAULT_PROMPT } from '@/lib/sf2xBench';
import { modelsByCompany, DEFAULT_TOP_MODELS, MAX_ARENA_MODELS, isDailyTrackedModel } from '@/lib/sf2xCompanies';
import CompanyBadge from '@/components/sf2x/CompanyBadge';
import ModelAnswerDetail from '@/components/sf2x/ModelAnswerDetail';

const COMPANY = new Map(ALL_MODELS.map((m) => [m.value, m.tag]));

function corrColor(c) {
  if (c == null) return 'text-slate-500';
  if (c >= 0.8) return 'text-emerald-300';
  if (c >= 0.5) return 'text-amber-300';
  return 'text-rose-300';
}

export default function ModelArena() {
  const [prompt, setPrompt] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    return q || DEFAULT_PROMPT;
  });
  const [picked, setPicked] = useState(DEFAULT_TOP_MODELS);
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [msg, setMsg] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      const list = await base44.entities.ModelBenchRun.list('-created_date', 300);
      setHistory(list);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function toggleModel(value) {
    setPicked((p) => {
      if (p.includes(value)) return p.filter((x) => x !== value);
      if (p.length >= MAX_ARENA_MODELS) return p;
      return [...p, value];
    });
  }

  async function runArena(models, questionOverride) {
    if (running || !models.length) return;
    setPicked(models);
    setRunning(true);
    setMsg(null);
    setLatest(null);
    try {
      const payload = { models, run_type: 'manual' };
      if (questionOverride !== undefined) payload.question = questionOverride;
      else payload.question = prompt;
      const res = await base44.functions.invoke('runModelBench', payload);
      const data = res?.data || res;
      if (data?.error) { setMsg(data.error); return; }
      setLatest(data);
      if (data.question && questionOverride === '') setPrompt(data.question);
      await loadHistory();
    } catch (e) {
      setMsg(e?.message || 'Run failed.');
    } finally {
      setRunning(false);
    }
  }

  function run(questionOverride) { return runArena(picked, questionOverride); }
  function runWith(models, questionOverride) { return runArena(models, questionOverride); }

  const standings = useMemo(() => {
    const map = new Map();
    for (const r of history) {
      if (r.error) continue;
      const cur = map.get(r.model) || { model: r.model, label: r.model_label || r.model, company: COMPANY.get(r.model) || '—', runs: 0, wins: 0, trustSum: 0, corrSum: 0, corrCount: 0, latSum: 0, latCount: 0, wv: 0, wvTotal: 0 };
      cur.runs += 1;
      cur.wins += r.is_winner ? 1 : 0;
      cur.trustSum += r.trust_score || 0;
      if (r.correctness != null) { cur.corrSum += r.correctness; cur.corrCount++; }
      if (r.latency_ms != null) { cur.latSum += r.latency_ms; cur.latCount++; }
      const wv = r.warrant_summary?.validity;
      if (wv) { cur.wvTotal++; if (wv === 'valid') cur.wv++; }
      map.set(r.model, cur);
    }
    return [...map.values()].map((s) => ({
      ...s,
      win_rate: s.runs ? Math.round((s.wins / s.runs) * 100) : 0,
      avg_trust: s.runs ? Math.round(s.trustSum / s.runs) : 0,
      avg_corr: s.corrCount ? Math.round((s.corrSum / s.corrCount) * 100) : null,
      avg_latency: s.latCount ? Math.round(s.latSum / s.latCount) : null,
      warrant_valid: s.wvTotal ? Math.round((s.wv / s.wvTotal) * 100) : null,
    })).sort((a, b) => b.wins - a.wins || (b.avg_corr ?? -1) - (a.avg_corr ?? -1) || b.avg_trust - a.avg_trust);
  }, [history]);

  const recentDates = useMemo(() => {
    const set = new Set(history.map((r) => r.question_date).filter(Boolean));
    return [...set].slice(0, 14);
  }, [history]);

  function companyBadge(c) {
    return <CompanyBadge company={c} />;
  }

  return (
    <div className="space-y-5">
      {/* Prompt + Model Selection + Run Buttons */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Swords className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-slate-200">Model Arena</h2>
          <span className="text-[11px] text-slate-500 hidden sm:inline">— native + OpenRouter models on the same question, verifier-judged and logged</span>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Benchmark question — or leave empty and click Question of the day"
          className="min-h-[72px] resize-none bg-[#0B0F16] border-white/10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/40"
        />

        {/* Model Selection Popover */}
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5">
                <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                {picked.length} model{picked.length === 1 ? '' : 's'} selected
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-[#0B0F16] border-white/10 p-3" align="start">
              <div className="flex gap-2 mb-3">
                <button onClick={() => setPicked(DEFAULT_TOP_MODELS)} className="text-[10px] px-2 py-1 rounded bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20">Top 8</button>
                <button onClick={() => setPicked(DEFAULT_TOP_MODELS.slice(0, 5))} className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-300 hover:bg-white/10">Top 5</button>
                <button onClick={() => setPicked(DEFAULT_TOP_MODELS.slice(0, 3))} className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-300 hover:bg-white/10">Top 3</button>
                <button onClick={() => setPicked([])} className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-400 hover:bg-white/10 ml-auto">Clear</button>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">Max {MAX_ARENA_MODELS} models per run · one verifier shared</p>
              <div className="max-h-60 overflow-auto space-y-2">
                {[...modelsByCompany().entries()].map(([company, models]) => (
                  <div key={company}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <CompanyBadge company={company} showName={false} />
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{company}</span>
                    </div>
                    {models.map((m) => (
                      <label key={m.value} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-white/5 cursor-pointer">
                        <Checkbox
                          checked={picked.includes(m.value)}
                          onCheckedChange={() => toggleModel(m.value)}
                          className="border-white/20 data-[state=checked]:bg-emerald-400 data-[state=checked]:border-emerald-400"
                        />
                        <span className="text-xs text-slate-300">{m.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <span className="text-[11px] text-slate-500">{picked.length}/{MAX_ARENA_MODELS} selected</span>
        </div>

        {/* Quick Run Buttons */}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={() => runWith(DEFAULT_TOP_MODELS.slice(0, 3))} disabled={running}
            variant="outline" className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 disabled:opacity-40 h-11 md:h-9">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />} Run Top 3
          </Button>
          <Button onClick={() => runWith(DEFAULT_TOP_MODELS.slice(0, 5))} disabled={running}
            variant="outline" className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 disabled:opacity-40 h-11 md:h-9">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />} Run Top 5
          </Button>
          <Button onClick={() => runWith(DEFAULT_TOP_MODELS)} disabled={running}
            variant="outline" className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 disabled:opacity-40 h-11 md:h-9">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Swords className="h-4 w-4 mr-2" />} Run All
          </Button>
          <Button onClick={() => run('')} disabled={running || !picked.length}
            variant="outline" className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 disabled:opacity-40 h-11 md:h-9">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />} Question of the day
          </Button>
          <Button onClick={() => run()} disabled={running || !prompt.trim() || !picked.length}
            className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40 h-11 md:h-9">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Swords className="h-4 w-4 mr-2" />} Run Selected ({picked.length})
          </Button>
        </div>
        {msg && <p className="mt-3 text-xs text-rose-300">{msg}</p>}
      </div>

      {/* Running indicator */}
      {running && (
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Running {picked.length} models + 1 verifier ({picked.length + 1} LLM calls)…</p>
        </div>
      )}

      {/* Latest run */}
      {!running && latest && (
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-200">Latest run</h3>
            <span className="text-[11px] text-slate-500">{latest.run_type} · {latest.question_date}</span>
          </div>
          <p className="text-xs text-slate-400 mb-4 italic">"{latest.question}"</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
            {latest.runs.map((r, i) => (
              <motion.div key={r.model} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`rounded-xl border bg-[#070A0F] p-4 ${r.is_winner ? 'border-emerald-400/40 ring-1 ring-emerald-400/20' : 'border-white/10'}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {r.is_winner && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    <span className="text-sm text-slate-200 font-medium truncate">{r.label}</span>
                  </div>
                  {r.error ? (
                    <span className="text-[10px] text-rose-300">failed</span>
                  ) : (
                    companyBadge(COMPANY.get(r.model))
                  )}
                </div>
                {r.error ? (
                  <p className="text-xs text-rose-300/80">{r.error}</p>
                ) : (
                  <ModelAnswerDetail run={r} />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Standings table */}
      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-medium text-slate-200">Model standings</h3>
          <span className="text-[11px] text-slate-500">— cumulative wins across {history.length} logged run{history.length === 1 ? '' : 's'}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/30">
            <Sparkles className="h-3 w-3" /> Daily-tracked grouped first
          </span>
        </div>
        {standings.length === 0 ? (
          <p className="text-xs text-slate-600 py-6 text-center">No runs logged yet. Run the arena to start building the leaderboard.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                  <th className="text-left font-medium px-4 py-2.5">#</th>
                  <th className="text-left font-medium px-4 py-2.5">Model</th>
                  <th className="text-right font-medium px-4 py-2.5">Runs</th>
                  <th className="text-right font-medium px-4 py-2.5">Wins</th>
                  <th className="text-right font-medium px-4 py-2.5">Win rate</th>
                  <th className="text-right font-medium px-4 py-2.5">Avg correct</th>
                  <th className="text-right font-medium px-4 py-2.5">Avg trust</th>
                  <th className="text-right font-medium px-4 py-2.5">Avg latency</th>
                  <th className="text-right font-medium px-4 py-2.5">Warrant valid</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let rank = 0;
                  const out = [];
                  const daily = standings.filter((s) => isDailyTrackedModel(s.model));
                  const other = standings.filter((s) => !isDailyTrackedModel(s.model));
                  const renderRow = (s) => {
                    const i = rank++;
                    out.push(
                      <tr key={s.model} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-slate-500">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-200 font-medium">{s.label}</div>
                          <div className="mt-0.5">{companyBadge(s.company)}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.runs}</td>
                        <td className="px-4 py-3 text-right text-emerald-300">{s.wins}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.win_rate}%</td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.avg_corr != null ? s.avg_corr + '%' : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.avg_trust}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.avg_latency != null ? s.avg_latency + 'ms' : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{s.warrant_valid != null ? s.warrant_valid + '%' : '—'}</td>
                      </tr>
                    );
                  };
                  if (daily.length) {
                    out.push(
                      <tr key="grp-daily" className="bg-emerald-400/[0.04]">
                        <td colSpan={9} className="px-4 py-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Daily-tracked · run every day by the arena</span>
                        </td>
                      </tr>
                    );
                    daily.forEach(renderRow);
                  }
                  if (other.length) {
                    out.push(
                      <tr key="grp-other" className="bg-white/[0.02]">
                        <td colSpan={9} className="px-4 py-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">On-demand only · fewer runs, not directly comparable</span>
                        </td>
                      </tr>
                    );
                    other.forEach(renderRow);
                  }
                  return out;
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run history — detailed */}
      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-200">Run history</h3>
          <span className="text-[11px] text-slate-500">— click any day to expand full answers</span>
        </div>
        {loadingHist ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 text-slate-500 animate-spin" /></div>
        ) : recentDates.length === 0 ? (
          <p className="text-xs text-slate-600 py-6 text-center">No history yet.</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
            {recentDates.map((d) => {
              const dayRuns = history.filter((r) => r.question_date === d);
              const q = dayRuns[0]?.question;
              const sorted = [...dayRuns].sort((a, b) => (b.correctness ?? -1) - (a.correctness ?? -1) || (b.trust_score || 0) - (a.trust_score || 0));
              const expanded = expandedDate === d;
              return (
                <div key={d} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                  <button onClick={() => setExpandedDate(expanded ? null : d)} className="w-full text-left">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono text-slate-400">{d}</span>
                      <span className="text-[10px] text-slate-600">{dayRuns[0]?.run_type}</span>
                    </div>
                    <p className="text-xs text-slate-300 mb-2 italic line-clamp-1">"{q}"</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map((r) => (
                        <span key={r.id} className={`text-[10px] px-2 py-0.5 rounded inline-flex items-center gap-1 ${r.is_winner ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/5 text-slate-400'}`}>
                          {companyBadge(COMPANY.get(r.model))}
                          {r.model_label} · {r.correctness != null ? Math.round(r.correctness * 100) + '%' : Math.round(r.trust_score || 0)}
                        </span>
                      ))}
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-3 space-y-3">
                      {sorted.map((r) => (
                        <div key={r.id} className="rounded-lg bg-black/30 border border-white/5 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {r.is_winner && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                              <span className="text-xs text-slate-200 font-medium truncate">{r.model_label}</span>
                              {companyBadge(COMPANY.get(r.model))}
                            </div>
                            <span className={`text-sm font-semibold ${corrColor(r.correctness)}`}>
                              {r.correctness != null ? Math.round(r.correctness * 100) + '%' : '—'}
                            </span>
                          </div>
                          <ModelAnswerDetail run={r} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}