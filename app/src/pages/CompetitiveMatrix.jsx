import React from 'react';
import { ShieldCheck, Check, X, Minus, TrendingUp } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const COMPETITORS = ['Aether', 'Galileo (Luna)', 'Arthur AI', 'Weights & Biases', 'Helicone', 'LangSmith'];

const ROWS = [
  { feature: 'Cryptographic Warrants', aether: 'full', desc: 'Ed25519-signed provenance with content hashes', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'none', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Multi-Model Tribunal', aether: 'full', desc: '3 independent labs debate, cross-firm verifier merges', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'partial', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Real-time Hallucination Detection', aether: 'full', desc: 'Sub-200ms fast-path + deep tribunal', others: { 'Galileo (Luna)': 'full', 'Arthur AI': 'partial', 'Weights & Biases': 'none', 'Helicone': 'partial', 'LangSmith': 'none' } },
  { feature: 'Source Grounding & Snapshots', aether: 'full', desc: 'SHA-256 content hashes preserved at attestation time', others: { 'Galileo (Luna)': 'partial', 'Arthur AI': 'none', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Domain-Authoritative Grounding', aether: 'full', desc: 'PubMed, SEC EDGAR, statutes — not generic web', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'partial', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Provenance Lineage Tracking', aether: 'full', desc: 'Full audit trail: inquiry → answer → warrant → correction', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'partial', 'Weights & Biases': 'partial', 'Helicone': 'none', 'LangSmith': 'partial' } },
  { feature: 'Calibration Reports', aether: 'full', desc: 'Brier scores, per-bucket calibration, regression gates', others: { 'Galileo (Luna)': 'partial', 'Arthur AI': 'partial', 'Weights & Biases': 'partial', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Open-source Verifier', aether: 'full', desc: 'Anyone can verify a warrant without trusting Aether', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'none', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Cross-Firm Verification', aether: 'full', desc: 'Models from different labs verify each other', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'none', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'AI Governance Compliance', aether: 'full', desc: 'EU AI Act, NIST AI RMF, ISO 42001 ready', others: { 'Galileo (Luna)': 'none', 'Arthur AI': 'partial', 'Weights & Biases': 'none', 'Helicone': 'none', 'LangSmith': 'none' } },
  { feature: 'Credit-Based Pricing', aether: 'full', desc: 'Pay per verification depth, not per request', others: { 'Galileo (Luna)': 'partial', 'Arthur AI': 'partial', 'Weights & Biases': 'partial', 'Helicone': 'partial', 'LangSmith': 'partial' } },
];

function Cell({ val }) {
  if (val === 'full') return <td className="text-center py-3"><span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-400/15"><Check className="h-3.5 w-3.5 text-emerald-400" /></span></td>;
  if (val === 'partial') return <td className="text-center py-3"><span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-yellow-400/10"><Minus className="h-3.5 w-3.5 text-yellow-400/70" /></span></td>;
  return <td className="text-center py-3"><span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-rose-400/5"><X className="h-3.5 w-3.5 text-rose-400/40" /></span></td>;
}

export default function CompetitiveMatrix() {
  const aetherWins = ROWS.filter(r => r.aether === 'full').length;
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <TrendingUp className="h-3.5 w-3.5" /> Competitive Analysis
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Aether vs Everyone Else</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Most AI observability tools tell you <span className="text-slate-200">what happened</span>. Aether proves <span className="text-emerald-300">why you should trust it</span>.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0B0F16]">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">Capability</th>
                {COMPETITORS.map(c => (
                  <th key={c} className={`text-center px-3 py-3 text-xs font-medium ${c === 'Aether' ? 'text-emerald-300' : 'text-slate-500'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? 'bg-white/[0.01]' : ''}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-200">{row.feature}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{row.desc}</div>
                  </td>
                  <Cell val={row.aether} />
                  {COMPETITORS.slice(1).map(c => <Cell key={c} val={row.others[c]} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-5">
            <div className="text-3xl font-heading font-bold text-emerald-300">{aetherWins}/{ROWS.length}</div>
            <div className="text-xs text-slate-400 mt-1">Capabilities where Aether is the only full solution</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-3xl font-heading font-bold text-white">Ed25519</div>
            <div className="text-xs text-slate-400 mt-1">Cryptographic signature standard — no competitor offers this</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-3xl font-heading font-bold text-white">3 Labs</div>
            <div className="text-xs text-slate-400 mt-1">Cross-firm tribunal — Google, OpenAI, Anthropic verify each other</div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a href="/console" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-[#070A0F] font-semibold hover:bg-emerald-400 transition-colors">
            <ShieldCheck className="h-5 w-5" /> Try Aether Free
          </a>
        </div>
      </div>
    </div>
  );
}