import React, { useState } from 'react';
import { Stethoscope, DollarSign, Scale, AlertTriangle, Trophy } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const DOMAINS = [
  {
    key: 'finance',
    Icon: DollarSign,
    label: 'Finance',
    color: 'emerald',
    desc: 'Investment claims, earnings data, regulatory filings verified against SEC EDGAR and authoritative financial sources.',
    sources: ['SEC EDGAR', 'Federal Reserve', 'Bloomberg API', 'IRS publications'],
    commonErrors: ['Fabricated merger/acquisition news', 'Invented financial figures', 'Misstated regulatory requirements', 'False earnings dates'],
  },
  {
    key: 'medical',
    Icon: Stethoscope,
    label: 'Medical',
    color: 'rose',
    desc: 'Drug interactions, treatment protocols, and clinical claims verified against PubMed, clinical guidelines, and FDA labels.',
    sources: ['PubMed', 'FDA drug labels', 'CDC guidelines', 'ClinicalKey'],
    commonErrors: ['Contraindicated drug recommendations', 'Fabricated clinical trial results', 'Incorrect dosages', 'Misstated side effects'],
  },
  {
    key: 'legal',
    Icon: Scale,
    label: 'Legal',
    color: 'sky',
    desc: 'Case citations, statute references, and legal precedent verified against authoritative legal databases and court records.',
    sources: ['CourtListener', 'Cornell LII', 'State statutes', 'US Code'],
    commonErrors: ['Fabricated case citations', 'Misquoted statutes', 'Invented legal precedent', 'Incorrect jurisdiction rules'],
  },
  {
    key: 'safety',
    Icon: AlertTriangle,
    label: 'Safety',
    color: 'amber',
    desc: 'Harmful content, dangerous instructions, and policy-violating output detected through adversarial red-teaming and safety classifiers.',
    sources: ['Red-team attack corpus', 'Safety policy registry', 'Harm taxonomy', 'Toxicity classifiers'],
    commonErrors: ['Dangerous instructions', 'Policy violations', 'Harmful stereotypes', 'Manipulation attempts'],
  },
];

const colorMap = {
  emerald: { text: 'text-emerald-300', border: 'border-emerald-400/20', bg: 'bg-emerald-400/[0.03]', dot: 'bg-emerald-400' },
  rose: { text: 'text-rose-300', border: 'border-rose-400/20', bg: 'bg-rose-400/[0.03]', dot: 'bg-rose-400' },
  sky: { text: 'text-sky-300', border: 'border-sky-400/20', bg: 'bg-sky-400/[0.03]', dot: 'bg-sky-400' },
  amber: { text: 'text-amber-300', border: 'border-amber-400/20', bg: 'bg-amber-400/[0.03]', dot: 'bg-amber-400' },
};

export default function DomainBenchmarks() {
  const [active, setActive] = useState('finance');
  const domain = DOMAINS.find(d => d.key === active);
  const c = colorMap[domain.color];

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <Trophy className="h-3.5 w-3.5" /> Domain Benchmarks
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Domain-Specific Trust</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Aether grounds claims against authoritative sources for each domain — not generic web content.
          </p>
        </div>

        {/* Domain tabs */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {DOMAINS.map(d => {
            const dc = colorMap[d.color];
            return (
              <button
                key={d.key}
                onClick={() => setActive(d.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  active === d.key ? `${dc.bg} ${dc.text} border ${dc.border}` : 'text-slate-400 border border-white/10 hover:bg-white/5'
                }`}
              >
                <d.Icon className="h-4 w-4" /> {d.label}
              </button>
            );
          })}
        </div>

        {/* Active domain detail */}
        <div className={`rounded-2xl border ${c.border} ${c.bg} p-8`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center">
              <domain.Icon className={`h-6 w-6 ${c.text}`} />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-bold text-white">{domain.label}</h2>
              <p className="text-xs text-slate-500">Domain-authoritative verification</p>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">{domain.desc}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Authoritative Sources</h3>
              <div className="flex flex-wrap gap-2">
                {domain.sources.map(s => (
                  <span key={s} className={`text-xs px-2.5 py-1 rounded-lg border ${c.border} ${c.bg} ${c.text}`}>{s}</span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Common Hallucinations Detected</h3>
              <ul className="space-y-2">
                {domain.commonErrors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${c.dot} shrink-0`} />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0B0F16] p-6">
          <h3 className="text-sm font-medium text-white mb-2">How Domain Grounding Works</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            When an inquiry is tagged with a domain, Aether's tribunal routes claims to domain-specific authoritative source registries. Generic web results are penalized for high-stakes domains — a medical claim grounded only in a blog post receives a trust penalty, even if the blog happens to be correct. The grounding ratio (authoritative sources / total sources) is recorded on every warrant.
          </p>
        </div>
      </div>
    </div>
  );
}