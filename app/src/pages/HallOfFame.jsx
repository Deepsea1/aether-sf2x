import React, { useEffect, useState, useCallback } from 'react';
import { Flame, Loader2, Share2, Check, AlertTriangle, Twitter, TrendingUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';

// Hallucination Hall of Fame — powered by the `hallOfFame` backend function.
// Displays the worst hallucinations caught, sorted by lowest trust score.
// Each entry is shareable with a unique URL and tweetable.

function tone(t) { return t >= 50 ? 'text-amber-300' : 'text-rose-300'; }

export function HallOfFameContent() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [params] = useSearchParams();
  const highlight = params.get('entry');

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('hallOfFame', { limit: 10 });
      const d = res?.data || res;
      if (d?.error) setError(d.error);
      else setEntries(d?.entries || d?.items || (Array.isArray(d) ? d : []));
    } catch (e) { setError(e?.message || 'Could not load the hall of fame.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sorted = [...entries].sort((a, b) => (a.trust_score ?? 0) - (b.trust_score ?? 0));

  function shareUrl(e) { return `${window.location.origin}/hall-of-fame?entry=${e.id || e.warrant_id || ''}`; }
  function tweet(e) {
    const text = `🚨 Aether caught an AI hallucination (trust ${Math.round(e.trust_score ?? 0)}/100): "${(e.text_preview || e.text || '').slice(0, 80)}…" — ${shareUrl(e)}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  }
  function copy(e, id) { navigator.clipboard?.writeText(shareUrl(e)); setCopied(id); setTimeout(() => setCopied(null), 1600); }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-rose-400/80">Hallucination Hall of Fame</span>
          <h1 className="font-heading text-3xl font-semibold text-white tracking-tight mt-1">When AI got it wrong — and Aether caught it.</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">The most dramatic hallucinations the tribunal caught, ranked by how badly the model misled. Every entry is a real verdict. Tweet any of them.</p>
        </div>

        {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">{error}</div>}

        {loading && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>}
        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center">
            <TrendingUp className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
            <div className="text-sm text-slate-400">No flagged hallucinations yet.</div>
            <div className="text-[12px] text-slate-600 mt-1">Run the <Link to="/playground" className="text-emerald-300">playground</Link> — the tribunal logs every catch.</div>
          </div>
        )}

        <div className="space-y-4">
          {sorted.map((e, i) => {
            const id = e.id || e.warrant_id || i;
            const isHi = highlight === String(id);
            return (
              <div key={id} className={`rounded-2xl border bg-[#0B0F16] p-5 ${isHi ? 'border-rose-400/40 ring-1 ring-rose-400/20' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-rose-400/80 tabular-nums">#{i + 1}</span>
                    {e.source && <div className="text-[11px] text-slate-500 capitalize">{e.source}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`text-2xl font-semibold leading-none ${tone(e.trust_score ?? 0)}`}>{Math.round(e.trust_score ?? 0)}<span className="text-sm text-slate-600">/100</span></div>
                      <div className="text-[10px] text-slate-600">trust</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold leading-none text-rose-300">{e.corrections_count ?? e.flags ?? 0}</div>
                      <div className="text-[10px] text-slate-600">flags</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-rose-400/80 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> What the AI said</div>
                <div className="text-[13px] text-slate-300 mt-1 line-clamp-4 whitespace-pre-wrap">{e.text_preview || e.text || e.answer_text}</div>

                {(e.corrections?.length > 0 || e.correction) && (
                  <div className="mt-3 text-[11px] text-emerald-400/80 uppercase tracking-wider">What Aether caught</div>
                )}
                {e.corrections?.length > 0 && (
                  <ul className="space-y-1 mt-1">{e.corrections.slice(0, 3).map((c, j) => <li key={j} className="text-[12px] text-slate-400 flex gap-1.5"><span className="text-emerald-300 shrink-0">•</span><span className="line-clamp-2">{typeof c === 'string' ? c : c.text || c.note}</span></li>)}</ul>
                )}
                {e.correction && <div className="text-[12px] text-slate-400 mt-1">{e.correction}</div>}

                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => tweet(e)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"><Twitter className="h-3.5 w-3.5" /> Tweet this</button>
                  <button onClick={() => copy(e, id)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10">{copied === id ? <><Check className="h-3.5 w-3.5 text-emerald-300" /> Copied</> : <><Share2 className="h-3.5 w-3.5" /> Share link</>}</button>
                  {isHi && <span className="text-[11px] text-rose-300 ml-auto">↑ Shared entry</span>}
                </div>
              </div>
            );
          })}
        </div>
      </main>
  );
}

export default function HallOfFame() {
  return <div className="min-h-screen bg-[#070A0F] text-slate-200 pb-16"><PublicNav /><HallOfFameContent /></div>;
}