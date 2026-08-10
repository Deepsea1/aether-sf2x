import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { ShieldCheck, ArrowRight, Check, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Aether vs competitors — powered by the `competitorComparison` function.
// Renders a feature comparison table with checkmarks/X marks across
// Aether, Vectara, Galileo, Cleanlab, plus a positioning statement.

const STATIC_ROWS = [
  { label: 'Detection method', aether: '3-model tribunal (proposer→critic→verifier) + red-team', vectara: 'Retrieval grounding (RAG)', galileo: 'Evaluation + observability', cleanlab: 'Data-centric ML cleaning' },
  { label: 'Real-time hallucination flagging', aether: 'Yes — inline, mid-conversation', vectara: 'No (grounding score only)', galileo: 'Post-hoc eval', cleanlab: 'No (dataset-level)' },
  { label: 'Accuracy (benchmark)', aether: 'AUC 1.0 / r=0.98 on published internal suite (n=24)', vectara: 'Grounding-focused', galileo: 'Metric-based', cleanlab: 'Data-quality scores' },
  { label: 'Latency', aether: '~5s fast path', vectara: 'Fast', galileo: 'Variable', cleanlab: 'Batch' },
  { label: 'End-user accessibility', aether: 'One-click verify button + Chrome extension', vectara: 'Developer API', galileo: 'Developer platform', cleanlab: 'Data team tool' },
  { label: 'Chrome extension', aether: 'Yes — ChatGPT, Claude, Gemini, Copilot', vectara: 'No', galileo: 'No', cleanlab: 'No' },
  { label: 'Public model leaderboard', aether: 'Yes — daily', vectara: 'No', galileo: 'No', cleanlab: 'No' },
  { label: 'Pricing (entry)', aether: 'Free — 500 verifications/mo', vectara: 'Usage-based', galileo: 'Custom', cleanlab: 'Custom' },
  { label: 'Verifiable warrants', aether: 'Yes — signed, auditable', vectara: 'No', galileo: 'No', cleanlab: 'No' },
];
const STATIC_POSITIONING = 'Aether is the only layer that sits inside the conversation alongside any LLM, turns each answer into a warranted trust score in seconds, and ships a one-click verify button for end users — not just developers.';

const COMPETITORS = ['aether', 'vectara', 'galileo', 'cleanlab'];

function Cell({ value }) {
  if (value === true) return <Check className="h-4 w-4 text-emerald-400" />;
  if (value === false) return <X className="h-4 w-4 text-rose-400/70" />;
  return <span className="text-[13px] text-slate-300">{value}</span>;
}

export function CompareContent() {
  const [rows, setRows] = useState(null);
  const [positioning, setPositioning] = useState(STATIC_POSITIONING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('competitorComparison', {});
        const d = res?.data || res;
        if (Array.isArray(d?.features) || Array.isArray(d?.rows)) {
          setRows(d.features || d.rows);
          if (d.positioning) setPositioning(d.positioning);
        }
      } catch (e) { /* fall back to static */ }
      finally { setLoading(false); }
    })();
  }, []);

  const display = rows || STATIC_ROWS;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/80">Comparison</span>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-white tracking-tight mt-1">Aether vs the field</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl mx-auto">How the trust layer for AI compares to retrieval-grounding, evaluation, and data-cleaning tools.</p>
        </div>

        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-emerald-400 animate-spin" /></div>}

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0B0F16]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-[11px] uppercase tracking-wider text-slate-500 px-4 py-3 font-medium">Capability</th>
                <th className="text-left px-4 py-3 bg-emerald-400/[0.04]">
                  <div className="text-emerald-300 font-semibold">Aether</div>
                  <div className="text-[10px] text-slate-500">The Truth Layer for AI</div>
                </th>
                <th className="text-left text-slate-300 px-4 py-3 font-medium">Vectara</th>
                <th className="text-left text-slate-300 px-4 py-3 font-medium">Galileo</th>
                <th className="text-left text-slate-300 px-4 py-3 font-medium">Cleanlab</th>
              </tr>
            </thead>
            <tbody>
              {display.map((r, i) => (
                <tr key={r.label || i} className={i % 2 ? 'bg-white/[0.01]' : ''}>
                  <td className="px-4 py-3 text-slate-400 text-[13px]">{r.label}</td>
                  <td className="px-4 py-3 bg-emerald-400/[0.03]"><Cell value={r.aether} /></td>
                  <td className="px-4 py-3"><Cell value={r.vectara} /></td>
                  <td className="px-4 py-3"><Cell value={r.galileo} /></td>
                  <td className="px-4 py-3"><Cell value={r.cleanlab} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80 mb-2">Positioning</div>
          <p className="text-sm text-slate-200 max-w-3xl mx-auto leading-relaxed">{positioning}</p>
        </div>

        <div className="text-center">
          <Link to="/playground" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-5 h-11 text-sm font-medium text-[#070A0F] hover:opacity-90">
            Try Aether free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="text-[11px] text-slate-600 text-center max-w-2xl mx-auto">Comparison reflects publicly documented capabilities of each platform as of 2026. Aether trust scores are vendor claims pending independent third-party audit — see our <Link to="/methodology" className="underline hover:text-slate-400">methodology</Link>.</p>
      </main>
  );
}

export default function Compare() {
  return <div className="min-h-screen bg-[#070A0F] text-slate-200 pb-16"><PublicNav /><CompareContent /></div>;
}