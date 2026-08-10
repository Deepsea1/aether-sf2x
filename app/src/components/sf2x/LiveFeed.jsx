import React, { useEffect, useState, useRef } from 'react';
import { Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Live activity ticker — powered by the `liveActivityFeed` function.
// Re-fetches every 5s and renders a scrolling feed of anonymized tribunal
// activity: emoji + category + trust score + verdict.

function emojiFor(verdict, score) {
  if (verdict === 'verified') return '✅';
  if (verdict === 'rejected') return '❌';
  if (verdict === 'contested') return '⚠️';
  return score >= 75 ? '✅' : score >= 50 ? '⚠️' : '❌';
}
function toneFor(t) { return t >= 75 ? 'text-emerald-300' : t >= 50 ? 'text-amber-300' : 'text-rose-300'; }
function verdictLabel(v, t) { return v || (t >= 75 ? 'verified' : t >= 50 ? 'contested' : 'rejected'); }

function normalize(item) {
  const score = Number(item.trust_score ?? item.score ?? 0);
  const verdict = item.verdict || null;
  return {
    emoji: item.emoji || emojiFor(verdict, score),
    category: item.category || item.label || item.domain || 'AI answer',
    trust_score: score,
    verdict: verdictLabel(verdict, score),
  };
}

export default function LiveFeed() {
  const [items, setItems] = useState([]);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef(null);

  async function fetchFeed() {
    try {
      const res = await base44.functions.invoke('liveActivityFeed', { limit: 20 });
      const d = res?.data || res;
      const list = Array.isArray(d) ? d : (d?.items || d?.feed || d?.entries || []);
      setItems(list.map(normalize));
      setPulse(true);
      setTimeout(() => setPulse(false), 350);
    } catch (e) { /* decorative — silent */ }
  }

  useEffect(() => {
    fetchFeed();
    timerRef.current = setInterval(fetchFeed, 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!items.length) return null;
  const shown = items.slice(0, 6);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 inline-flex items-center gap-1.5"><Activity className="h-3 w-3" /> Live tribunal activity</span>
        <span className="text-[10px] text-slate-600 ml-auto">updates every 5s</span>
      </div>
      <div className="space-y-1.5">
        {shown.map((it, i) => (
          <div key={i} className={`flex items-center gap-2 text-[13px] transition-all duration-300 ${pulse ? 'translate-y-0 opacity-100' : 'opacity-90'}`}>
            <span className="text-base leading-none">{it.emoji}</span>
            <span className="text-slate-300 truncate flex-1">{it.category}</span>
            <span className="text-slate-600">—</span>
            <span className={`font-semibold tabular-nums ${toneFor(it.trust_score)}`}>{Math.round(it.trust_score)}<span className="text-[11px] text-slate-600">/100</span></span>
            <span className={`text-[11px] ${toneFor(it.trust_score)}`}>{it.verdict}</span>
          </div>
        ))}
      </div>
    </div>
  );
}