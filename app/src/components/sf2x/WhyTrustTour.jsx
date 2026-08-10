import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Gauge, GitBranch, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';

const STEPS = [
  { key: 'warrant', title: 'The warrant', Icon: ShieldCheck },
  { key: 'metrics', title: 'The discipline', Icon: Gauge },
  { key: 'lineage', title: 'The lineage', Icon: GitBranch },
];

function validityTone(v) {
  if (v === 'valid') return 'text-emerald-300';
  if (v === 'weak') return 'text-amber-300';
  return 'text-rose-300';
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 text-xs uppercase tracking-wider shrink-0 mt-0.5">{label}</span>
      <span className="text-slate-200 text-sm text-right">{value}</span>
    </div>
  );
}

export default function WhyTrustTour({ open, onOpenChange, inquiry, version, warrant, review, correction }) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);

  if (!version) return null;
  const w = warrant || {};
  const premises = Array.isArray(w.premises) ? w.premises : [];
  const sources = Array.isArray(w.sources) ? w.sources : [];
  const trust = version.trust_score;
  const S = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0B0F16] border-white/10 text-slate-200 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <S.Icon className="h-4 w-4 text-emerald-400" />
            Why trust this answer?
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-emerald-400' : 'bg-white/10'}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">
              Every AETHER answer carries a <span className="text-slate-200">Decision Validity Warrant</span> — an explicit,
              checkable argument, not a confident-sounding sentence.
            </p>
            <Row label="Conclusion" value={w.conclusion || '—'} />
            <Row label="Validity" value={<span className={validityTone(w.validity_status)}>{w.validity_status || '—'}</span>} />
            <Row label="Confidence" value={w.confidence_score != null ? `${Math.round(w.confidence_score * 100)}%` : '—'} />
            <Row label="Premises" value={`${premises.length} explicit`} />
            <Row label="Sources" value={`${sources.length} cited`} />
            {w.expiry_date && <Row label="Valid until" value={new Date(w.expiry_date).toLocaleDateString()} />}
            <p className="text-xs text-slate-500 pt-1">
              If any premise breaks, the warrant is no longer valid — the answer must be re-derived, not silently trusted.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">Trust isn't a vibe — it's a measured discipline score across this answer.</p>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 flex items-center justify-between">
              <div>
                <div className="text-3xl font-semibold text-emerald-300 tabular-nums">{trust != null ? trust : '—'}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Trustworthy answer rate / 100</div>
              </div>
              <Gauge className="h-8 w-8 text-emerald-400/60" />
            </div>
            <p className="text-xs text-slate-500">
              This blends calibration, uncertainty disclosure, fabrication-risk resistance, and correction behavior — so a
              high score means the system is disciplined, not just fluent.
            </p>
            {correction && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-xs text-amber-200">
                This answer was corrected (v{correction.from_version} → v{correction.to_version}, {correction.severity}).
                Self-correction is part of the trust model.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">The answer isn't a black box — it's versioned, linked to its lineage, and governable.</p>
            <Row label="Answer version" value={`v${version.version}`} />
            <Row
              label="Inquiry"
              value={inquiry?.prompt ? (inquiry.prompt.length > 60 ? inquiry.prompt.slice(0, 60) + '…' : inquiry.prompt) : '—'}
            />
            <Row label="Stakes" value={inquiry?.stakes_level || version.stakes_level || '—'} />
            <Row
              label="Review state"
              value={
                review ? (
                  <span className={review.status === 'approved' ? 'text-emerald-300' : review.status === 'killed' ? 'text-rose-300' : 'text-amber-300'}>
                    {review.status}
                  </span>
                ) : (
                  <span className="text-emerald-300">auto-promoted</span>
                )
              }
            />
            <p className="text-xs text-slate-500">
              High-stakes answers can be routed to human review or suppressed by a kill-switch — governance is enforced,
              not optional.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-5">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-30">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-[11px] text-slate-600">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300">
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => onOpenChange(false)}
              className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}