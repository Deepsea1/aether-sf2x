// Per-domain epistemic calibration baselines.
// Each domain sets the support-ratio bar that counts as 'valid' vs 'weak' and a
// trust adjustment reflecting how strict the evidence standard is in that field.
// Higher stakes fields (medicine, finance, defense) demand more support and
// penalize raw scores, so an 80%-supported claim in Medicine is not the same as
// 80% in casual tech chat.

export const DOMAIN_CALIBRATION = {
  general: { label: 'General', valid_threshold: 0.8, weak_threshold: 0.5, trust_adjust: 0 },
  medicine: { label: 'Medicine', valid_threshold: 0.9, weak_threshold: 0.7, trust_adjust: -5 },
  finance: { label: 'Finance', valid_threshold: 0.9, weak_threshold: 0.7, trust_adjust: -5 },
  legal: { label: 'Legal', valid_threshold: 0.85, weak_threshold: 0.65, trust_adjust: -3 },
  science: { label: 'Science', valid_threshold: 0.85, weak_threshold: 0.6, trust_adjust: -2 },
  technology: { label: 'Technology', valid_threshold: 0.8, weak_threshold: 0.55, trust_adjust: 0 },
  defense: { label: 'Defense', valid_threshold: 0.92, weak_threshold: 0.75, trust_adjust: -8 },
  compliance: { label: 'Compliance', valid_threshold: 0.9, weak_threshold: 0.7, trust_adjust: -5 },
};

export function calibrationFor(domain) {
  const key = String(domain || 'general').toLowerCase();
  return DOMAIN_CALIBRATION[key] || DOMAIN_CALIBRATION.general;
}

import { MAX_TRUST_SCORE } from './sf2xCore.js';

export function calibrateTrust(rawTrust, domain) {
  const c = calibrationFor(domain);
  // Leave the top of the scale for future systems — no current AI is 100% correct.
  return Math.max(0, Math.min(MAX_TRUST_SCORE, Math.round(rawTrust + c.trust_adjust)));
}

export function verdictFromSupport(supportRatio, domain) {
  const c = calibrationFor(domain);
  if (supportRatio >= c.valid_threshold) return 'valid';
  if (supportRatio >= c.weak_threshold) return 'weak';
  return 'invalid';
}

// Verdict against an explicit calibration object (used by the empirical path).
export function verdictFromCalibration(supportRatio, calib) {
  if (supportRatio >= calib.valid_threshold) return 'valid';
  if (supportRatio >= calib.weak_threshold) return 'weak';
  return 'invalid';
}

// Empirical calibration: overrides the `general` domain's valid_threshold with
// the optimal threshold from the latest published CorrelationAudit (where the
// audit's accuracy was maximized). Per-domain auto-tuning needs per-domain
// audits we don't have yet, so other domains keep their heuristic baselines.
// Cached in-process for 10 minutes so it doesn't add a DB hit per attestation.
let _auditCache = { ts: 0, audit: null };
const AUDIT_TTL_MS = 10 * 60 * 1000;

export async function empiricalCalibration(svc, domain) {
  const base = calibrationFor(domain);
  const key = String(domain || 'general').toLowerCase();
  if (key !== 'general') return { ...base, source: 'heuristic' };
  try {
    const now = Date.now();
    if (now - _auditCache.ts > AUDIT_TTL_MS) {
      const list = await svc.entities.CorrelationAudit.list('-created_date', 1);
      _auditCache = { ts: now, audit: (list || [])[0] || null };
    }
    const a = _auditCache.audit;
    if (a && typeof a.threshold === 'number' && a.threshold > 0 && a.threshold < 1) {
      return { ...base, valid_threshold: a.threshold, source: 'empirical (general dataset audit)' };
    }
  } catch { /* fall back to heuristic */ }
  return { ...base, source: 'heuristic' };
}