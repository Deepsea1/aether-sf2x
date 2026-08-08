import React, { useState } from 'react';
import { Check, X, Flag, ShieldX, Loader2, ShieldCheck, FlaskConical, Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { CAPABILITY_LEVELS, SEVERITY_STYLES } from '@/lib/sf2xGovernance';
import { detectProblems, suggestedFix, splitPromptTag } from '@/lib/sf2xReview';
import { formatDistanceToNow } from 'date-fns';

const STATUS_STYLES = {
  pending: 'text-orange-300 bg-orange-400/10',
  approved: 'text-emerald-300 bg-emerald-400/10',
  rejected: 'text-rose-300 bg-rose-400/10',
  flagged: 'text-amber-300 bg-amber-400/10',
  killed: 'text-rose-300 bg-rose-400/10',
};

const CONSENSUS_STYLES = {
  agreed: 'text-emerald-300 bg-emerald-400/10',
  contested: 'text-amber-300 bg-amber-400/10',
  rejected: 'text-rose-300 bg-rose-400/10',
};

// Color-code the verifier's recommended action by severity — REJECT/KILL/SUPPRESS
// in red, RE-RUN/VERIFY/FLAG in amber, APPROVE in emerald.
function recommendationStyle(action) {
  const a = String(action || '').toUpperCase();
  if (/(KILL|SUPPRESS|REJECT|DO NOT|BLOCK)/.test(a)) return { text: 'text-rose-300', block: 'border-rose-400/30 bg-rose-400/[0.05]', icon: 'text-rose-300', tone: 'rose' };
  if (/(RE-RUN|RERUN|VERIFY|RE-CHECK|RECHECK|FLAG|ESCALAT)/.test(a)) return { text: 'text-yellow-300', block: 'border-yellow-400/30 bg-yellow-400/[0.06]', icon: 'text-yellow-300', tone: 'amber' };
  if (/(APPROVE|PROMOTE|CLEAR|READY)/.test(a)) return { text: 'text-emerald-300', block: 'border-emerald-400/25 bg-emerald-400/[0.04]', icon: 'text-emerald-300', tone: 'slate' };
  return { text: 'text-slate-300', block: 'border-white/10 bg-white/[0.02]', icon: 'text-slate-300', tone: 'slate' };
}

function CondensedSection({ label, count, tone = 'slate', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const toneRing = tone === 'amber' ? 'hover:border-amber-400/30' : tone === 'rose' ? 'hover:border-rose-400/30' : 'hover:border-white/15';
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`mt-2 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden ${toneRing} transition-colors`}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left group/sect">
          <ChevronRight className={`h-3 w-3 text-slate-500 transition-transform ${open ? 'rotate-90' : ''} group-hover/sect:text-slate-300`} />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 group-hover/sect:text-slate-300">{label}</span>
          {count > 0 && <span className="text-[10px] text-slate-600">· {count}</span>}
          <span className="ml-auto text-[10px] text-slate-600 group-hover/sect:text-slate-400">{open ? 'collapse' : 'expand'}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 border-t border-white/5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ReviewRow({ review, version, inquiry, warrant, correction, candidateVersion, busy, onDecide, onPrepare, onVerifyRepair }) {
  const [notes, setNotes] = useState('');
  const cap = CAPABILITY_LEVELS.find((c) => c.key === review.capability_level) || CAPABILITY_LEVELS[3];
  const trust = computeTrustworthyRate(version?.metrics, warrant);
  const isPending = review.status === 'pending';
  const isBusy = busy === review.id;
  const prepBusy = busy === `prep:${review.id}`;
  const problems = detectProblems(version, warrant, trust);
  const fix = suggestedFix(problems);
  const verified = correction && ['minor', 'moderate'].includes(correction.severity);
  const verdict = review.verdict;
  const candidateTrust = verdict?.candidate_trust ?? (candidateVersion ? computeTrustworthyRate(candidateVersion.metrics, null) : null);

  const { tag, question } = splitPromptTag(inquiry?.prompt);
  const rec = verdict ? recommendationStyle(verdict.recommended_action || (verdict.consensus === 'agreed' ? 'APPROVE' : verdict.consensus === 'rejected' ? 'KILL-SWITCH' : '') || verdict.verifier_verdict || '') : null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
      {/* tiny meta row — capability / status / trust / age */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cap.bg} ${cap.text}`}>{cap.key}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[review.status] || STATUS_STYLES.pending}`}>{review.status}</span>
          <span className="text-[10px] text-slate-500">trust {trust}</span>
        </div>
        <span className="text-[10px] text-slate-600 shrink-0">{formatDistanceToNow(new Date(review.created_date), { addSuffix: false })}</span>
      </div>

      {/* small source tag ABOVE the question — only when a bracketed tag was present */}
      {tag && (
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1 truncate">{tag}</div>
      )}

      {/* the question — big & white */}
      <p className="text-base font-medium text-white leading-snug">{question || '—'}</p>

      {/* Aether's answer — bigger & white */}
      {version?.answer_text && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1">Aether answer</div>
          <p className="text-sm text-slate-100 leading-relaxed line-clamp-4">{version.answer_text}</p>
        </div>
      )}

      {/* Problems found — condensed, expandable */}
      {problems.length > 0 && (
        <CondensedSection label="Problems found" count={problems.length} tone="amber">
          <div className="space-y-2 pt-1">
            {problems.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_STYLES[p.severity]?.bg || 'bg-white/5'} ${SEVERITY_STYLES[p.severity]?.text || 'text-slate-400'}`}>{p.severity}</span>
                <div>
                  <div className="text-[11px] text-slate-300">{p.category.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] text-slate-500">{p.why}</div>
                </div>
              </div>
            ))}
            <div className="text-[10px] text-slate-400 pt-1.5 border-t border-white/5">
              <span className="text-slate-500">Fix:</span> {fix}
            </div>
          </div>
        </CondensedSection>
      )}

      {/* Tribunal run description — condensed, expandable. Color-coded by recommendation */}
      {verdict ? (
        <CondensedSection label="Tribunal run" tone={rec.tone === 'amber' ? 'amber' : rec.tone === 'rose' ? 'rose' : 'slate'}>
          <div className="pt-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <FlaskConical className={`h-3.5 w-3.5 ${rec.icon}`} />
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Auto-test · verdict</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${CONSENSUS_STYLES[verdict.consensus] || 'text-slate-300 bg-white/5'}`}>{verdict.consensus}</span>
              <span className="text-[10px] text-slate-500">conf {Math.round((verdict.confidence || 0) * 100)}%</span>
            </div>
            {verdict.verifier_verdict && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Aether final report</div>
                <p className={`text-sm font-medium leading-relaxed ${rec.text}`}>{verdict.verifier_verdict}</p>
              </div>
            )}
            {verdict.corrections?.length > 0 && (
              <ul className="space-y-1">
                {verdict.corrections.map((c, i) => (
                  <li key={i} className="text-[11px] text-slate-400 flex gap-1.5"><span className="text-amber-300">•</span>{c}</li>
                ))}
              </ul>
            )}
            <div className={`text-sm pt-1.5 border-t border-white/5 ${rec.text}`}>
              <span className="font-semibold">Recommended:</span> <span className="font-bold">{verdict.recommended_action}</span>
            </div>
            {candidateVersion && (
              <div className="mt-2 rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 mb-1">
                  <Sparkles className="h-3 w-3" /> Verified answer prepared · trust {candidateTrust ?? '—'}
                </div>
                <p className="text-sm text-slate-100 line-clamp-3 leading-relaxed">{candidateVersion.answer_text}</p>
                <p className="text-[10px] text-slate-500 mt-1.5">Rejecting the original promotes this answer back into the queue for your verification.</p>
              </div>
            )}
          </div>
        </CondensedSection>
      ) : isPending && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={prepBusy || isBusy} onClick={() => onPrepare(review)}
            className="h-7 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 text-[11px] px-2.5">
            {prepBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FlaskConical className="h-3 w-3 mr-1" />} Run test
          </Button>
          <span className="text-[10px] text-slate-500">Auto-runs on load — prepares a verified candidate for you to approve.</span>
        </div>
      )}

      {correction && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-slate-500">Fix verification:</span>
          <span className="text-slate-400">v{correction.from_version}→v{correction.to_version}</span>
          <span className={correction.trust_delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>trust {correction.trust_delta >= 0 ? '+' : ''}{correction.trust_delta}</span>
          <span className="text-slate-500">drift {Math.round((correction.drift_score || 0) * 100)}%</span>
          {verified
            ? <span className="text-emerald-300 flex items-center gap-0.5"><ShieldCheck className="h-3 w-3" /> verified resolved</span>
            : <span className="text-amber-300">needs re-check</span>}
        </div>
      )}

      {/* Approve / Kill-switch — color coded */}
      <div className="flex items-center gap-2 mt-3">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Annotate / reviewer notes…"
          className="flex-1 h-8 rounded-lg bg-[#070A0F] border border-white/10 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
        />
        <Button size="sm" disabled={!isPending || isBusy} onClick={() => onDecide(review, 'approved', notes)}
          className="h-8 bg-emerald-500 text-[#070A0F] hover:bg-emerald-400 font-semibold px-3 border border-emerald-400" title="Approve">
          <Check className="h-3.5 w-3.5 mr-1" /> Approve
        </Button>
        <Button size="sm" disabled={!isPending || isBusy} onClick={() => onDecide(review, 'rejected', notes)}
          className="h-8 bg-yellow-400 text-[#070A0F] hover:bg-yellow-300 font-semibold px-3 border border-yellow-300" title="Reject / re-run">
          <X className="h-3.5 w-3.5 mr-1" /> Re-run
        </Button>
        <Button size="sm" variant="outline" disabled={!isPending || isBusy} onClick={() => onDecide(review, 'flagged', notes)}
          className="h-8 border-amber-400/40 text-amber-300 hover:bg-amber-400/10 px-2.5" title="Flag / escalate">
          <Flag className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" disabled={isBusy} onClick={() => onDecide(review, 'killed', notes)}
          className="h-8 bg-rose-500 text-white hover:bg-rose-400 font-semibold px-3 border border-rose-400" title="Kill-switch">
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5 mr-1" />} Kill
        </Button>
      </div>
      {review.notes && <p className="text-[11px] text-slate-500 mt-2 italic">“{review.notes}”</p>}
    </div>
  );
}