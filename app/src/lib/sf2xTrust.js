import { computeTrustworthyRate, timeUntilExpiry } from './sf2x';

export function computeTrustDimensions(metrics, warrant, review) {
  const m = metrics || {};
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const evidence = warrant?.validity_status === 'valid' ? 100 : warrant?.validity_status === 'weak' ? 50 : warrant?.validity_status ? 12 : 0;
  const contradiction = Math.round((1 - clamp(m.epistemic_drift_score)) * 100);
  const exp = timeUntilExpiry(warrant?.expiry_date);
  const freshness = exp.expired ? 18 : !warrant?.expiry_date ? 70 : Math.round(Math.min(100, 40 + Math.max(0, (new Date(warrant.expiry_date) - Date.now()) / 86400000) * 2));
  const calibration = Math.round((1 - clamp(m.expected_calibration_error)) * 100);
  const policy = review?.status === 'killed' ? 0 : review?.status === 'approved' ? 100 : review?.status ? 60 : 85;
  const reviewCompletion = review?.decided_date ? 100 : review && review.status !== 'pending' ? 100 : review ? 35 : 80;
  return [
    { key: 'evidence', label: 'Evidence support', value: evidence, reason: warrant?.validity_status === 'valid' ? 'All claims backed by a valid warrant.' : 'Warrant is weak, invalid, or missing.' },
    { key: 'contradiction', label: 'Contradiction resistance', value: contradiction, reason: clamp(m.epistemic_drift_score) > 0.4 ? 'Belief drift detected across versions.' : 'No contradiction detected.' },
    { key: 'freshness', label: 'Freshness', value: freshness, reason: exp.expired ? 'Premises expired — revalidate.' : 'Premises within revalidation window.' },
    { key: 'calibration', label: 'Calibration', value: calibration, reason: clamp(m.expected_calibration_error) > 0.3 ? 'Confidence diverges from evidence.' : 'Confidence tracks evidence.' },
    { key: 'policy', label: 'Policy compliance', value: policy, reason: review?.status === 'killed' ? 'Suppressed by governance gate.' : review?.status === 'approved' ? 'Cleared by human review.' : 'No policy violation detected.' },
    { key: 'review', label: 'Review completion', value: reviewCompletion, reason: review?.decided_date ? 'Human review completed.' : review ? 'Awaiting human review.' : 'No review required at this gate.' },
  ];
}

export const TRUST_STATUS_STYLES = {
  stable: { text: 'text-emerald-300', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30', label: 'Stable' },
  fragile: { text: 'text-amber-300', bg: 'bg-amber-400/10', ring: 'ring-amber-400/30', label: 'Fragile' },
  needs_review: { text: 'text-orange-300', bg: 'bg-orange-400/10', ring: 'ring-orange-400/30', label: 'Needs review' },
  blocked: { text: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/30', label: 'Blocked' },
  expired: { text: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/30', label: 'Expired' },
  unknown: { text: 'text-slate-300', bg: 'bg-white/5', ring: 'ring-white/10', label: 'Unknown' },
};

export function trustStatus(trust, warrant, review, dims) {
  if (!dims) return 'unknown';
  if (review?.status === 'killed') return 'blocked';
  if (warrant && timeUntilExpiry(warrant.expiry_date).expired) return 'expired';
  if (review && review.status === 'pending') return 'needs_review';
  const min = Math.min(...dims.map((d) => d.value));
  if (trust >= 75 && min >= 60) return 'stable';
  return 'fragile';
}

export function scoreSource(review) {
  return review?.decided_date ? 'hybrid' : 'auto';
}

export function fragilePerfect(trust, dims) {
  if (trust < 100) return false;
  return Math.min(...dims.map((d) => d.value)) < 70;
}

export function trustExplanation(trust, dims, warrant) {
  if (!dims || dims.every((d) => d.value === 0 && !warrant)) return 'Score is provisional — generate a warranted answer to populate the breakdown.';
  if (trust >= 100 && fragilePerfect(trust, dims)) return 'Perfect score, but fragile — it may rest on narrow evidence, repeated prompts, or low source diversity.';
  const low = dims.filter((d) => d.value < 60).sort((a, b) => a.value - b.value);
  if (trust >= 75 && low.length === 0) return 'High because the answer is well-supported, current, and consistent with the retrieved evidence.';
  if (trust >= 75) return 'High confidence, but limited evidence breadth — re-validate before relying on it at scale.';
  if (low.length) return `Low because ${low[0].label.toLowerCase()} is weak (${low[0].value}/100): ${low[0].reason}`;
  return 'Score reflects calibration, drift, warrant validity, and review status.';
}