import React, { useEffect, useState } from 'react';
import { ShieldAlert, Brain, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

// Honest, persistent disclosure banner for the benchmark surfaces. Covers the
// three credibility gaps a visitor most needs to see inline: (1) no independent
// third-party audit yet, (4) calibration is heuristic not ground-truthed, and
// (5) the verifier is itself an LLM. Surfaces the latest published correlation
// audit stats so the calibration's empirical basis is visible, not buried.
export default function TrustDisclosureBanner() {
  const [audit, setAudit] = useState(null);
  useEffect(() => {
    base44.entities.CorrelationAudit.list('-created_date', 1)
      .then((r) => setAudit((r || [])[0]))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
          <ShieldAlert className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-[12px] text-slate-300 leading-relaxed">
            <span className="font-medium text-amber-200">Not yet independently audited.</span>{' '}
            These scores are vendor claims until an external audit is complete.{' '}
            <Link to="/methodology" className="text-amber-300 underline-offset-2 hover:underline">Methodology &amp; limitations →</Link>
          </div>
        </div>
        <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
          <Brain className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-[12px] text-slate-300 leading-relaxed">
            <span className="font-medium text-amber-200">The verifier is itself an LLM.</span> It can be wrong, be fooled, or lack non-public knowledge — treat every trust score as a snapshot, not a guarantee.
          </div>
        </div>
        <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
          <Activity className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-[12px] text-slate-300 leading-relaxed">
            <span className="font-medium text-amber-200">Calibration is heuristic.</span>{' '}
            {audit
              ? <>Latest audit (n={audit.n_items}): Pearson r={Number(audit.pearson_r).toFixed(2)}, AUC={Number(audit.auc).toFixed(2)}, separation={Number(audit.separation).toFixed(1)} — not peer-reviewed.</>
              : <>Domain thresholds are hand-tuned, not derived from a peer-reviewed ground-truth set.</>}
          </div>
        </div>
      </div>
    </div>
  );
}