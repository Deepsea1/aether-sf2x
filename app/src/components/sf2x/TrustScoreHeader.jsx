import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import CapabilityBadge from '@/components/sf2x/CapabilityBadge';
import RatingKey from '@/components/sf2x/RatingKey';
import { computeTrustworthyRate } from '@/lib/sf2x';
import {
  computeTrustDimensions, trustStatus, TRUST_STATUS_STYLES, scoreSource,
  fragilePerfect, trustExplanation,
} from '@/lib/sf2xTrust';

export default function TrustScoreHeader({ inquiry, version, warrant, review, correction, explained, onExplain, tribunal }) {
  const trust = computeTrustworthyRate(version?.metrics, warrant);
  const dims = computeTrustDimensions(version?.metrics, warrant, review);
  const status = trustStatus(trust, warrant, review, dims);
  const st = TRUST_STATUS_STYLES[status] || TRUST_STATUS_STYLES.unknown;
  const source = scoreSource(review);
  const fragile = fragilePerfect(trust, dims);
  const scoreColor = fragile ? 'text-amber-300' : trust >= 75 ? 'text-emerald-300' : trust >= 50 ? 'text-amber-300' : 'text-rose-300';
  const isTribunal = tribunal?.mode === 'tribunal' || tribunal?.mode === 'fast';
  const crossFirm = isTribunal;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center justify-center w-[68px] shrink-0">
          <span className={`text-3xl font-semibold ${scoreColor}`}>{trust}</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-500">/ 100</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${st.bg} ${st.ring} ${st.text}`}>{st.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{source === 'hybrid' ? 'Human + Auto' : 'Auto'}</span>
            <CapabilityBadge stakes={inquiry?.stakes_level} metrics={version?.metrics} warrant={warrant} />
          </div>
          <p className="text-xs text-slate-400">{trustExplanation(trust, dims, warrant)}</p>
          {fragile && <p className="text-[11px] text-amber-300/80 mt-1">⚠ A perfect score can still be fragile when evidence is narrow.</p>}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mt-3 pt-3 border-t border-white/5">
        {isTribunal ? (
          <>Verified by a multi-role LLM tribunal (proposer, critic, verifier) plus an adversarial red-team pass. All roles are language models and may share correlated blind spots from overlapping training data — agreement between them is not independent confirmation. This run was {crossFirm ? 'cross-firm' : 'not cross-firm'} verified. Treat this score as a vendor claim. <Link to="/methodology" className="text-amber-300 underline-offset-2 hover:underline">See /methodology.</Link></>
        ) : (
          <>Verified by a single language model with no tribunal or red-team pass. The verifier is itself an LLM and can be wrong, be fooled, or lack non-public knowledge. This run was not cross-firm verified. Treat this score as a vendor claim. <Link to="/methodology" className="text-amber-300 underline-offset-2 hover:underline">See /methodology.</Link></>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Button size="sm" variant="ghost" onClick={onExplain} className="h-7 text-slate-300 hover:bg-white/5 hover:text-white text-[11px] px-2">
          <RefreshCw className="h-3 w-3 mr-1" /> {explained ? 'Hide breakdown' : 'Why this score?'}
        </Button>
        <RatingKey />
        {correction && (
          <span className="text-[10px] text-slate-500">
            What changed: v{correction.from_version}→v{correction.to_version} · trust {correction.trust_delta >= 0 ? '+' : ''}{correction.trust_delta}
          </span>
        )}
      </div>
    </div>
  );
}