import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, ArrowLeft, DollarSign, TrendingUp, Users, Target } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const SLIDES = [
  {
    label: 'Title',
    render: () => (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 mb-6">
          <ShieldCheck className="h-8 w-8 text-[#070A0F]" strokeWidth={2.5} />
        </div>
        <h1 className="text-5xl font-heading font-bold text-white tracking-tight">Aether</h1>
        <p className="text-xl text-emerald-300 mt-3">The Truth Layer for AI</p>
        <p className="text-sm text-slate-500 mt-8">Every answer is warranted, lineage-tracked, and epistemically scored.</p>
      </div>
    ),
  },
  {
    label: 'Problem',
    render: () => (
      <div>
        <div className="text-xs uppercase tracking-wider text-rose-300 mb-4">The Problem</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-6">AI hallucinations cost businesses billions.</h2>
        <div className="space-y-4">
          {[
            { stat: '$2B+', label: 'Annual losses from AI hallucinations in legal, medical, and financial sectors' },
            { stat: '27%', label: 'Of AI-generated answers contain factual errors in high-stakes domains' },
            { stat: '0', label: 'Existing tools provide cryptographic proof of an answer\'s truth' },
          ].map(s => (
            <div key={s.stat} className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#070A0F] p-4">
              <span className="text-3xl font-heading font-bold text-rose-300 w-20">{s.stat}</span>
              <span className="text-sm text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Solution',
    render: () => (
      <div>
        <div className="text-xs uppercase tracking-wider text-emerald-300 mb-4">The Solution</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-6">Warrant-based verification.</h2>
        <p className="text-slate-400 leading-relaxed mb-6">
          Aether doesn't just flag suspicious answers — it proves why an answer is true. Every verification produces a cryptographic warrant: a signed, independently verifiable artifact with premises, sources, and confidence.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {['Multi-model tribunal', 'Ed25519 signatures', 'Source snapshots', 'Cross-firm verification', 'Domain grounding', 'Calibration reports'].map(f => (
            <div key={f} className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.03] px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-sm text-slate-300">{f}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Market',
    render: () => (
      <div>
        <div className="text-xs uppercase tracking-wider text-sky-300 mb-4">Market Opportunity</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-6">A $40B+ AI governance market.</h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { Icon: DollarSign, stat: '$40B', label: 'AI governance market by 2030' },
            { Icon: TrendingUp, stat: '34% CAGR', label: 'Trust & safety tooling growth' },
            { Icon: Target, stat: 'EU AI Act', label: 'Mandates provenance by 2026' },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-[#070A0F] p-5 text-center">
              <m.Icon className="h-6 w-6 text-sky-400 mx-auto mb-2" />
              <div className="text-2xl font-heading font-bold text-white">{m.stat}</div>
              <div className="text-xs text-slate-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">Aether is positioned at the intersection of AI observability, compliance, and trust infrastructure — a category that doesn't exist yet but every enterprise will need.</p>
      </div>
    ),
  },
  {
    label: 'Business',
    render: () => (
      <div>
        <div className="text-xs uppercase tracking-wider text-amber-300 mb-4">Business Model</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-6">Credit-based verification pricing.</h2>
        <div className="space-y-3">
          {[
            { tier: 'Starter', price: '$20/mo', credits: '250 verifications', desc: 'Individual developers' },
            { tier: 'Pro', price: '$100/mo', credits: '1,000 verifications', desc: 'Small teams' },
            { tier: 'Enterprise', price: '$1,999/mo', credits: '15,000 verifications', desc: 'Organizations with governance needs' },
            { tier: 'BYOK', price: '$999/mo', credits: '200,000 fair-use', desc: 'Bring your own model keys' },
          ].map(t => (
            <div key={t.tier} className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#070A0F] p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-white">{t.tier}</span>
                <span className="text-xs text-slate-500 ml-2">{t.desc}</span>
              </div>
              <span className="text-xs text-slate-400">{t.credits}</span>
              <span className="text-sm font-heading font-bold text-emerald-300 w-20 text-right">{t.price}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Traction',
    render: () => (
      <div>
        <div className="text-xs uppercase tracking-wider text-emerald-300 mb-4">Traction</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-6">Built. Calibrated. Live.</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { stat: 'Live', label: 'Multi-model tribunal operational with 3 labs' },
            { stat: 'Calibrated', label: 'Brier-scored against representative benchmarks' },
            { stat: 'Open', label: 'Public warrant verifier — anyone can check signatures' },
            { stat: 'Daily', label: 'Automated model arena benchmarking' },
          ].map(t => (
            <div key={t.label} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-5">
              <div className="text-xl font-heading font-bold text-emerald-300">{t.stat}</div>
              <div className="text-sm text-slate-400 mt-1">{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Ask',
    render: () => (
      <div className="text-center py-16">
        <div className="text-xs uppercase tracking-wider text-violet-300 mb-4">The Ask</div>
        <h2 className="text-3xl font-heading font-bold text-white mb-4">Join us in defining how AI is trusted.</h2>
        <p className="text-slate-400 max-w-lg mx-auto mb-8 leading-relaxed">
          Aether is building the infrastructure layer for AI trust — the standard every regulated industry will require. We're raising to scale the tribunal, ship enterprise integrations, and pursue the warrant standard RFC.
        </p>
        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-[#070A0F] font-semibold">
          <Users className="h-5 w-5" /> Let's Talk
        </div>
      </div>
    ),
  },
];

export default function PitchDeck() {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200 flex flex-col">
      <PublicNav />
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-20 pb-10 flex flex-col">
        {/* Slide indicator */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-slate-500">{slide + 1} / {SLIDES.length} · {current.label}</span>
          <div className="flex gap-1">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-emerald-400' : 'w-1.5 bg-white/15'}`} />
            ))}
          </div>
        </div>

        {/* Slide content */}
        <div className="flex-1 rounded-2xl border border-white/10 bg-[#0B0F16] p-8 sm:p-12 flex items-center">
          <div className="w-full">{current.render()}</div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setSlide(s => Math.max(0, s - 1))}
            disabled={slide === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Prev
          </button>
          <button
            onClick={() => setSlide(s => Math.min(SLIDES.length - 1, s + 1))}
            disabled={slide === SLIDES.length - 1}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-[#070A0F] text-sm font-medium hover:bg-emerald-400 disabled:opacity-30 transition-colors"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}