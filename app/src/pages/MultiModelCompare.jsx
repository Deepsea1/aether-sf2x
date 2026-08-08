import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Loader2, Sparkles, Share2, Check, Award, TrendingDown, BarChart3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PublicNav from '@/components/sf2x/PublicNav';

function Nav() {
  return <PublicNav />;
}

const STATUS_COLOR = {
  verified: 'text-emerald-300 bg-emerald-400/[0.06]',
  unverified: 'text-amber-300 bg-amber-400/[0.06]',
  hallucination: 'text-rose-300 bg-rose-400/[0.06]',
};

function Gauge({ score }) {
  const tone = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#fb7185';
  const r = 26, c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative h-16 w-16">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1f2937" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="5" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold" style={{ color: tone }}>{Math.round(score)}</div>
    </div>
  );
}

export function MultiModelCompareContent() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!prompt.trim() || loading) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await base44.functions.invoke('multiModelCompare', { prompt: prompt.trim() });
      const d = res?.data || res;
      if (d?.error) setError(d.error); else setData(d);
    } catch (e) { setError(e?.message || 'Comparison failed.'); }
    finally { setLoading(false); }
  }

  function share() {
    const url = `${window.location.origin}/multi-model?q=${encodeURIComponent(prompt)}`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  }

  const models = data?.models || data?.results || [];
  const summary = data?.summary || {};

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-2 space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/80">Multi-Model Comparison</span>
          <h1 className="font-heading text-3xl font-semibold text-white tracking-tight mt-1">Same question. Four AIs. Who hallucinates?</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">Ask a question and watch GPT-4o, Claude, Gemini, and Llama answer side by side — each sentence color-coded: green verified, yellow unverified, red hallucination.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Does drinking coffee stunt your growth?"
            rows={2}
            className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30 resize-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={run} disabled={!prompt.trim() || loading} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 h-10 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {loading ? 'Comparing models…' : 'Compare models'}
            </button>
            {data && <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 h-10 text-xs text-slate-200 hover:bg-white/10">{copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Share2 className="h-3.5 w-3.5" />} {copied ? 'Link copied' : 'Share comparison'}</button>}
          </div>
        </div>

        {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">{error}</div>}

        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 h-64 animate-pulse"><div className="h-4 w-20 rounded bg-white/5 mb-3" /><div className="h-16 w-16 rounded-full bg-white/5 mx-auto mb-4" /><div className="space-y-2"><div className="h-2.5 w-full rounded bg-white/5" /><div className="h-2.5 w-4/5 rounded bg-white/5" /><div className="h-2.5 w-3/5 rounded bg-white/5" /></div></div>)}
          </div>
        )}

        {data && models.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {models.map((m) => {
                const score = m.trust_score ?? m.trust ?? 0;
                const verdict = m.verdict || (score >= 75 ? 'verified' : score >= 50 ? 'contested' : 'rejected');
                const sentences = m.sentences || m.segments || [];
                return (
                  <div key={m.name} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-white truncate">{m.name || m.model}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${verdict === 'verified' ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : verdict === 'contested' ? 'text-amber-300 ring-amber-400/30 bg-amber-400/10' : 'text-rose-300 ring-rose-400/30 bg-rose-400/10'}`}>{verdict}</span>
                    </div>
                    <div className="flex justify-center mb-3"><Gauge score={score} /></div>
                    <div className="text-[12px] leading-relaxed space-y-1 flex-1">
                      {sentences.length > 0
                        ? sentences.map((s, i) => (
                          <span key={i} className={`inline rounded px-0.5 ${STATUS_COLOR[s.status] || STATUS_COLOR.unverified}`}>{(s.text || s.sentence || '') + ' '}</span>
                        ))
                        : <span className="text-slate-400 whitespace-pre-wrap">{m.response || m.answer || m.text}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 flex items-center gap-3"><Award className="h-5 w-5 text-emerald-400" /><div><div className="text-[11px] text-slate-500">Best</div><div className="text-sm font-semibold text-emerald-300">{summary.best || models.slice().sort((a, b) => (b.trust_score ?? 0) - (a.trust_score ?? 0))[0]?.name}</div></div></div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-4 flex items-center gap-3"><TrendingDown className="h-5 w-5 text-rose-400" /><div><div className="text-[11px] text-slate-500">Worst</div><div className="text-sm font-semibold text-rose-300">{summary.worst || models.slice().sort((a, b) => (a.trust_score ?? 0) - (b.trust_score ?? 0))[0]?.name}</div></div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 flex items-center gap-3"><BarChart3 className="h-5 w-5 text-slate-300" /><div><div className="text-[11px] text-slate-500">Average</div><div className="text-sm font-semibold text-white">{summary.average != null ? Math.round(summary.average) : Math.round(models.reduce((s, m) => s + (m.trust_score ?? 0), 0) / models.length)}/100</div></div></div>
            </div>
          </>
        )}
      </main>
  );
}

export default function MultiModelCompare() {
  return <div className="min-h-screen bg-[#070A0F] text-slate-200 pb-16"><Nav /><MultiModelCompareContent /></div>;
}