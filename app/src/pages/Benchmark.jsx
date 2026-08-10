import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, Share2, Activity, Trophy, ArrowRight, Copy, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PublicNav from '@/components/sf2x/PublicNav';

const OG_IMAGE = 'https://media.base44.com/images/public/6a6babb38b48187e5d4799c4/615cf5785_generated_image.png';

// NOTE: this page publishes no fixed comparison set. Every number it shows comes
// from the live BenchResult rows it fetches. Do not reintroduce hardcoded
// competitor figures — the previous og:description carried "51 RAG+validation /
// 39 baseline LLM / 14 plain LLM" with no source anywhere in this codebase.
function pct(v, digits = 0) { return `${(Number(v || 0) * 100).toFixed(digits)}%`; }
function fmtMttc(s) { const m = Math.round((s || 0) / 60); return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`; }

function Nav() {
  return <PublicNav />;
}

function ShareBar({ score }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  // Share text tracks the live certified score. Until the leaderboard loads (or
  // if no certified run exists yet) it stays honestly general rather than
  // shipping a specific number no data backs.
  const tweetText = score != null
    ? `SF2X + red-team scores ${score}/100 on the AI hallucination benchmark — can your AI be trusted?`
    : 'The AI hallucination benchmark — can your AI be trusted? See the live certified leaderboard.';
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`;
  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a href={tweet} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10">
        <Share2 className="h-3.5 w-3.5" /> Share on X
      </a>
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent }) {
  const ring = accent === 'emerald' ? 'border-emerald-400/20' : 'border-white/10';
  const chip = accent === 'emerald' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-300';
  return (
    <div className={`rounded-2xl border ${ring} bg-[#0B0F16] p-4 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${chip}`}><Icon className="h-4 w-4" /></span>
        <span className="text-[11px] text-slate-500 leading-tight">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white leading-none">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function BenchmarkContent() {
  const [bench, setBench] = useState([]);

  useEffect(() => {
    base44.entities.BenchResult.list('-created_date', 20).then(setBench).catch(() => {});
  }, []);

  const certifiedRow = bench.filter((b) => b.certified).sort((a, b) => b.bench_score - a.bench_score)[0];
  const latestRow = bench[0];
  const metricsRow = certifiedRow || latestRow || {};
  // The one number this page can honestly publish: the best certified run's own
  // score, straight from the same BenchResult rows the table below renders.
  const certifiedScore = certifiedRow && certifiedRow.bench_score != null ? Math.round(certifiedRow.bench_score) : null;

  // Social meta tags + title for the benchmark share surface. Depends on
  // certifiedScore so link previews and the visible leaderboard always agree —
  // these tags are what scrapers and shared posts carry, so a hardcoded number
  // here outlives whatever the live data actually says.
  useEffect(() => {
    document.title = 'SF2X Benchmark — Can you trust your AI? | Hallucination Leaderboard';
    const setMeta = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    // No certified run loaded yet => no specific claim. The previous copy also
    // compared against "51 RAG+validation / 39 baseline / 14 plain LLM"; those
    // figures had no source anywhere in this codebase, so they are gone rather
    // than restated. Any comparison set added later must come from real rows.
    const scoreClaim = certifiedScore != null
      ? `SF2X + red-team scores ${certifiedScore}/100 on the AI hallucination benchmark. `
      : '';
    setMeta('og:title', 'SF2X Benchmark — Can you trust your AI?');
    setMeta('og:description', `${scoreClaim}See the live certified hallucination leaderboard.`);
    setMeta('og:image', OG_IMAGE);
    setMeta('og:url', window.location.href);
    setMeta('twitter:title', 'SF2X Benchmark — Can you trust your AI?');
    setMeta('twitter:description', `${scoreClaim}See the live certified hallucination leaderboard.`);
    setMeta('twitter:image', OG_IMAGE);
  }, [certifiedScore]);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 space-y-8">
        
        {/* Hero */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0B0F16] to-[#0B0F16]/60 p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/80">Public Benchmark</span>
            <span className="text-[10px] text-slate-600">· Aug 2026</span>
            {certifiedRow && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Certified</span>}
          </div>
          <h1 className="font-heading text-2xl sm:text-4xl font-semibold text-white tracking-tight leading-tight">
            Can you trust your AI? The hallucination benchmark.
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-3 max-w-2xl leading-relaxed">
            SF2X scores every AI system on whether its answers are warranted, supported, and resistant to adversarial attack. The full red-team loop is what separates a demo from trust infrastructure{certifiedScore != null ? ` — the best certified run scores ${certifiedScore}/100` : ''}.
          </p>
          <div className="mt-5"><ShareBar score={certifiedScore} /></div>
        </div>

        {/* Key metrics — SF2X certified run */}
        <div>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Key metrics — SF2X certified run</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard icon={ShieldCheck} accent="emerald" label="Warrant rate" value={metricsRow.warrant_rate != null ? pct(metricsRow.warrant_rate) : '—'} sub="Answers carrying a valid warrant" />
            <MetricCard icon={Trophy} accent="emerald" label="Trustworthy rate" value={metricsRow.trustworthy_rate != null ? metricsRow.trustworthy_rate.toFixed(0) : '—'} sub="Mean trustworthy answer rate" />
            <MetricCard icon={Activity} label="Correction rate" value={metricsRow.correction_rate != null ? pct(metricsRow.correction_rate) : '—'} sub="Answers later corrected" />
            <MetricCard icon={Activity} accent="emerald" label="Drift score" value={metricsRow.drift_score != null ? metricsRow.drift_score.toFixed(2) : '—'} sub="Lower is more stable" />
            <MetricCard icon={Activity} label="MTTC" value={metricsRow.mean_time_to_correction != null ? fmtMttc(metricsRow.mean_time_to_correction) : '—'} sub="Mean time to correction" />
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div>
            <div className="text-sm font-medium text-white">Try it on your own AI answer</div>
            <p className="text-[12px] text-slate-400 mt-1">Paste any claim into the tribunal playground and watch the proposer–critic–verifier debate render a verdict in real time.</p>
          </div>
          <Link to="/playground" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2.5 text-sm font-medium text-[#070A0F] hover:opacity-90 shrink-0">
            Open the playground <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed max-w-3xl">
          Trust scores are vendor claims until independently audited. SF2X commits to at least two third-party audits (TruthfulQA / HaluEval correlation) published on the <Link to="/methodology" className="underline hover:text-slate-400">methodology page</Link>. Field baselines are reference systems, not SF2X products.
        </p>
      </main>
  );
}

export default function Benchmark() {
  return <div className="min-h-screen bg-[#070A0F] text-slate-200 pb-16"><Nav /><BenchmarkContent /></div>;
}