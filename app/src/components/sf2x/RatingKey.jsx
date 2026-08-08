import React from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// A compact "How to read this" popup that explains what every percentage and
// rating on a score card / answer / warrant actually means. Drop it onto any
// card that shows a rating so users always have the key one tap away.

function Row({ dot, title, desc }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <div>
        <div className="text-[12px] font-medium text-slate-200">{title}</div>
        <div className="text-[11px] text-slate-500 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

export default function RatingKey({ label = 'How to read this', className = '' }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-300 transition-colors ${className}`}
        >
          <Info className="h-3.5 w-3.5" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[330px] max-w-[90vw] bg-[#0B0F16] border-white/10 text-slate-200 p-4 rounded-xl">
        <div className="text-sm font-semibold text-white mb-1">How to read a trust score</div>
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
          Trust scores are 0–100, domain-calibrated. Medicine, finance, and legal apply stricter thresholds than general knowledge. A score is a snapshot, not a warranty.
        </p>

        <div className="space-y-2.5 mb-3">
          <Row dot="bg-emerald-400" title="valid" desc="≥ domain valid threshold — claims well-supported by evidence." />
          <Row dot="bg-amber-400" title="weak" desc="mixed support — some claims unsupported or thin evidence." />
          <Row dot="bg-rose-400" title="invalid" desc="unsupported / fabricated — claims contradicted or unevidenced." />
          <Row dot="bg-slate-500" title="expired" desc="premises past their revalidation date — warrant must be re-checked." />
        </div>

        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 pt-2 border-t border-white/5">Other ratings on these cards</div>
        <div className="space-y-2">
          <Row dot="bg-sky-400" title="Correctness (0–100%)" desc="Verifier-judged factual + epistemic accuracy vs the best answer." />
          <Row dot="bg-emerald-400" title="Win rate (0–100%)" desc="Share of questions a model won or tied for top correctness." />
          <Row dot="bg-teal-400" title="Warrant rate (0–100%)" desc="Share of answers backed by a valid decision-validity warrant." />
          <Row dot="bg-amber-400" title="Resistance (0–100%)" desc="Share of red-team attacks the answer resisted." />
          <Row dot="bg-rose-400" title="Drift score (0–100%, lower better)" desc="How much an answer shifted across versions or over time." />
          <Row dot="bg-indigo-400" title="Confidence (0–100%)" desc="Warrant confidence in the conclusion; high confidence + low drift is ideal." />
          <Row dot="bg-fuchsia-400" title="Calibration error / ECE (lower better)" desc="How well stated confidence matches actual accuracy." />
          <Row dot="bg-violet-400" title="Bench / composite (0–100)" desc="A single epistemic-discipline score combining warrant, trust, correction, and resistance." />
        </div>

        <p className="text-[10px] text-slate-600 mt-3 pt-2 border-t border-white/5 leading-relaxed">
          No model is 100%. Scores are capped below perfection to leave room for growth and to reflect irreducible uncertainty.
        </p>
      </PopoverContent>
    </Popover>
  );
}