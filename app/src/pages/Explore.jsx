import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight, Users, CalendarDays, Sparkles, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Input } from '@/components/ui/input';

function trustColor(t) {
  if (t >= 80) return 'text-emerald-300';
  if (t >= 60) return 'text-amber-300';
  return 'text-rose-300';
}
function corrColor(c) {
  if (c == null) return 'text-slate-500';
  if (c >= 0.8) return 'text-emerald-300';
  if (c >= 0.5) return 'text-amber-300';
  return 'text-rose-300';
}

export function ExploreContent() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    base44.entities.ModelBenchRun.list('-created_date', 500)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of runs) {
      if (r.error) continue;
      const key = (r.question || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, question: key, runs: [], dates: new Set(), types: new Set() });
      const g = map.get(key);
      g.runs.push(r);
      if (r.question_date) g.dates.add(r.question_date);
      if (r.run_type) g.types.add(r.run_type);
    }
    const arr = [...map.values()].map((g) => {
      const sorted = [...g.runs].sort(
        (a, b) => (b.correctness ?? -1) - (a.correctness ?? -1) || (b.trust_score || 0) - (a.trust_score || 0)
      );
      const winner = sorted.find((r) => r.is_winner) || sorted[0];
      return { ...g, runs: sorted, winner, dates: [...g.dates].sort().reverse(), types: [...g.types] };
    });
    arr.sort((a, b) => (b.dates[0] || '').localeCompare(a.dates[0] || ''));
    return arr;
  }, [runs]);

  const filtered = useMemo(() => {
    if (!q.trim()) return groups;
    const t = q.toLowerCase();
    return groups.filter((g) => g.question.toLowerCase().includes(t));
  }, [groups, q]);

  return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-400/[0.06] via-white/[0.02] to-transparent p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-sky-300 bg-sky-400/10 px-2 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" /> Explore
            </span>
            <span className="text-[11px] text-slate-500">{groups.length} surfaced question{groups.length === 1 ? '' : 's'}</span>
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Community questions</h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
            Every question the SF2X arena has tested — daily and community-submitted — with the verifier-judged winner and every model answer. Re-run any question in the Arena to see how the field performs today.
          </p>
          <div className="mt-4 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search surfaced questions…"
              className="pl-9 bg-[#0B0F16] border-white/10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-sky-400/40"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-white/20 border-t-sky-400 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="text-sm text-slate-400">
              {q ? 'No questions match your search.' : 'No questions surfaced yet. Run the Arena to populate the feed.'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((g, i) => {
              const open = openKey === g.key;
              const w = g.winner;
              return (
                <motion.div
                  key={g.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      {g.types.includes('daily') && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full">Daily</span>
                      )}
                      {g.types.includes('manual') && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-300 bg-sky-400/10 px-2 py-0.5 rounded-full">Community</span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                      <CalendarDays className="h-3 w-3" /> {g.dates[0] || '—'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed mb-3">"{g.question}"</p>
                  {w && (
                    <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
                      <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-slate-200 font-medium">{w.model_label}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-500">correctness <span className={corrColor(w.correctness)}>{w.correctness != null ? Math.round(w.correctness * 100) + '%' : '—'}</span></span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-500">trust <span className={trustColor(w.trust_score)}>{Math.round(w.trust_score || 0)}</span></span>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-white/5">
                    <button
                      onClick={() => setOpenKey(open ? null : g.key)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <Users className="h-3.5 w-3.5" /> {g.runs.length} answer{g.runs.length === 1 ? '' : 's'}
                    </button>
                    <Link
                      to={`/bench?q=${encodeURIComponent(g.question)}`}
                      className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300 hover:text-emerald-200 transition-colors"
                    >
                      Re-run in Arena <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2">
                      {g.runs.map((r) => (
                        <div key={r.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {r.is_winner && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
                              <span className="text-xs text-slate-200 font-medium truncate">{r.model_label}</span>
                            </div>
                            <span className={`text-sm font-semibold ${corrColor(r.correctness)}`}>
                              {r.correctness != null ? Math.round(r.correctness * 100) : '—'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">{r.answer_text}</p>
                          <div className="mt-2 text-[10px]">
                            <span className="text-slate-600">trust <span className={trustColor(r.trust_score)}>{Math.round(r.trust_score || 0)}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
  );
}

export default function Explore() {
  return <AppShell><ExploreContent /></AppShell>;
}