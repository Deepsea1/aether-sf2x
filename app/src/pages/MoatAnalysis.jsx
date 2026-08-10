import React from 'react';
import { Database, Network, Cpu, Scale, TrendingUp } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const MOATS = [
  {
    Icon: Database,
    title: 'Data Moat',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-400/20',
    bgColor: 'bg-emerald-400/[0.03]',
    summary: 'Every warrant generates calibration data. Over time, Aether accumulates the largest labeled corpus of verified AI hallucinations — making detection increasingly accurate while competitors start from zero.',
    points: [
      'Each verification produces ground-truth labels (supported/unsupported/falsified)',
      'Calibration corpus grows with every inquiry — competitors can\'t replicate this without running their own tribunal',
      'Regression gates prevent quality degradation — the corpus only improves detection',
    ],
  },
  {
    Icon: Network,
    title: 'Network Effects',
    color: 'text-sky-400',
    borderColor: 'border-sky-400/20',
    bgColor: 'bg-sky-400/[0.03]',
    summary: 'More users → more edge cases surfaced → better catch rates → more users. The tribunal improves as it sees novel hallucination patterns across industries.',
    points: [
      'Cross-industry hallucination patterns feed back into detection rules',
      'Domain-authoritative registries expand with each new vertical onboarded',
      'Open-source verifier creates a trust network — warrants are verifiable anywhere',
    ],
  },
  {
    Icon: Cpu,
    title: 'Technical Moat',
    color: 'text-violet-400',
    borderColor: 'border-violet-400/20',
    bgColor: 'bg-violet-400/[0.03]',
    summary: 'The multi-model tribunal is architecturally hard to replicate: 3 independent labs, cross-firm verification, adversarial falsification, and source-snapshot preservation — all orchestrated in one pipeline.',
    points: [
      'Requires relationships with multiple AI providers (Google, OpenAI, Anthropic, xAI, Mistral)',
      'Cross-firm constraint means no single vendor can self-certify',
      'Source snapshot infrastructure (SHA-256 + fetch pipeline + SSRF protection) took months to build',
      'Calibration pipeline (Brier scores, regression gates) is a research-grade system',
    ],
  },
  {
    Icon: Scale,
    title: 'Regulatory Moat',
    color: 'text-amber-400',
    borderColor: 'border-amber-400/20',
    bgColor: 'bg-amber-400/[0.03]',
    summary: 'AI governance regulations (EU AI Act, NIST AI RMF, ISO 42001) require provenance, auditability, and risk documentation. Warrants are purpose-built to satisfy these — competitors would need to rebuild from scratch.',
    points: [
      'EU AI Act Article 13: transparency & traceability → warrants provide cryptographic provenance',
      'NIST AI RMF: risk documentation → tribunal verdicts + calibration reports map directly',
      'ISO 42001: AI management system → audit trail + lineage tracking built in',
      'First-mover: Aether defines the warrant standard before regulators mandate it',
    ],
  },
];

export default function MoatAnalysis() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <TrendingUp className="h-3.5 w-3.5" /> Investor Analysis
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Why Aether Wins</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Four compounding moats that deepen with scale and time.
          </p>
        </div>

        <div className="space-y-5">
          {MOATS.map(m => (
            <div key={m.title} className={`rounded-2xl border ${m.borderColor} ${m.bgColor} p-6`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <m.Icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <h2 className="text-xl font-heading font-semibold text-white">{m.title}</h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">{m.summary}</p>
              <ul className="space-y-2">
                {m.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className={`mt-1.5 h-1 w-1 rounded-full ${m.color.replace('text-', 'bg-')} shrink-0`} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-[#0B0F16] p-8">
          <h2 className="text-lg font-heading font-semibold text-white mb-3">The Compounding Effect</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Each moat reinforces the others: the data moat improves detection (technical), which attracts regulated industries (regulatory), which generates more calibration data (data), which draws more users (network). Competitors solving any single layer miss the flywheel — Aether's advantage compounds quarterly.
          </p>
        </div>
      </div>
    </div>
  );
}