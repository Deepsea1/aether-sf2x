import React from 'react';
import { ShieldCheck, FlaskConical, FileCheck, Radar, Crosshair, Lock, ArrowRight } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const PILLARS = [
  { Icon: FlaskConical, title: 'Multi-Model Tribunal', desc: 'Three independent AIs from different labs answer, cross-examine, and reconcile. A cross-firm verifier synthesizes the hardened answer. No single model can fool the tribunal.', color: 'text-emerald-400' },
  { Icon: FileCheck, title: 'Cryptographic Warrants', desc: 'Every answer is backed by an Ed25519-signed warrant with premises, conclusion, confidence, and source hashes. Anyone can verify it — no trust in Aether required.', color: 'text-sky-400' },
  { Icon: Radar, title: 'Source Grounding', desc: 'Claims are checked against live web sources with SHA-256 content snapshots preserved at attestation time. Sources can\'t rewrite history.', color: 'text-violet-400' },
  { Icon: Crosshair, title: 'Adversarial Red Team', desc: 'Every verification runs a mandatory adversarial attack. If the falsifier finds a strong counter-case, the warrant is capped — no false confidence.', color: 'text-rose-400' },
  { Icon: Lock, title: 'Domain Authority', desc: 'Medical claims checked against PubMed. Financial claims against SEC EDGAR. Legal claims against statutes. Generic web doesn\'t pass for high-stakes domains.', color: 'text-amber-400' },
  { Icon: ShieldCheck, title: 'Calibration Reports', desc: 'Brier scores, per-bucket calibration, regression gates. Every release is gated by FABRICATED catch-rate regression. Trust is measured, not claimed.', color: 'text-teal-400' },
];

export default function WhyAether() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <ShieldCheck className="h-3.5 w-3.5" /> Why Aether
          </div>
          <h1 className="text-4xl sm:text-6xl font-heading font-bold text-white tracking-tight">
            Every answer is <span className="text-emerald-400">warranted</span>.
          </h1>
          <p className="mt-6 text-xl text-slate-400 max-w-2xl mx-auto">
            Galileo scores hallucinations. Arthur monitors models. Aether <span className="text-slate-200">proves</span> the truth — with cryptographic signatures, multi-model debate, and preserved evidence.
          </p>
        </div>

        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.03] p-8 mb-16">
          <h2 className="text-sm uppercase tracking-wider text-rose-300 font-medium mb-3">The Problem</h2>
          <p className="text-lg text-slate-300 leading-relaxed">
            AI hallucinations cost businesses billions. A law firm cites a fabricated case. A medical assistant recommends a contraindicated drug. A financial model invents a merger. Existing tools flag <span className="text-slate-100">suspicious patterns</span> — but they can't prove <span className="text-slate-100">why an answer is true</span>, and they can't hold evidence accountable when sources change.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
          {PILLARS.map(p => (
            <div key={p.title} className="rounded-xl border border-white/10 bg-[#0B0F16] p-6 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <p.Icon className={`h-5 w-5 ${p.color}`} />
                </div>
                <h3 className="text-lg font-heading font-semibold text-white">{p.title}</h3>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-8 text-center mb-16">
          <h2 className="text-2xl font-heading font-bold text-white mb-4">The Aether Guarantee</h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            If an answer carries an Aether warrant, you can independently verify its premises, check its source hashes, and reproduce its tribunal verdict. <span className="text-emerald-300 font-medium">No black box. No trust required. Just proof.</span>
          </p>
        </div>

        <div className="text-center">
          <a href="/competitive-matrix" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-slate-200 font-medium hover:bg-white/5 transition-colors">
            See the full competitive matrix <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}