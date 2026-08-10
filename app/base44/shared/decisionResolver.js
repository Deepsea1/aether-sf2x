// Decision resolver — the deterministic §8.1 verdict ladder (MASTER_PLAN v5).
// Pure module: no imports, no I/O, no clocks — every function is a total
// function of its inputs, so the resolver is fully harness-testable and two
// runs over the same inputs always resolve identically (§8.3 rule 6). Models
// and heuristics may PROPOSE signals; only this resolver produces verdicts,
// and no caller can skip a rung.

export const RESOLVER_VERSION = 'resolver-1.0.0';

// The eight claim verdicts. Order here is documentation, not precedence —
// precedence is the resolveClaim ladder below.
export const CLAIM_VERDICTS = [
  'verified_for_stated_use',
  'supported_with_limits',
  'needs_review',
  'not_supported',
  'contradicted',
  'out_of_scope',
  'blocked',
  'unknown',
];

// The §8.1 ladder, evaluated top-down; first match wins:
//   1. prohibited      → blocked                  (policy prohibits the stated use)
//   2. injection       → needs_review             (injection indicators on load-bearing
//                                                  evidence cap the verdict — H12)
//   3. out_of_scope    → out_of_scope             (unsupported domain/jurisdiction/pack scope)
//   4. contradicted    → contradicted             (applicable counterevidence defeats the claim)
//   5. unsupported     → not_supported            (support below the pack threshold)
//   6. insufficient    → needs_review             (coverage/applicability/freshness insufficient)
//      evidence_absent → unknown                  (no evidence basis at all — absence is never support)
//   7. limited         → supported_with_limits    (material limits remain on the support)
//   8. otherwise       → verified_for_stated_use
//
// Callers with no evidence basis must say so: pass insufficient:true when the
// evidence was sought and found wanting (→ needs_review), or evidence_absent:true
// when there is simply nothing to assess (→ unknown). An input of all-false
// flags is an assertion that every rung was actually checked and cleared.
export function resolveClaim(signals = {}) {
  const s = signals || {};
  if (s.prohibited) return 'blocked';
  if (s.injection) return 'needs_review';
  if (s.out_of_scope) return 'out_of_scope';
  if (s.contradicted) return 'contradicted';
  if (s.unsupported) return 'not_supported';
  if (s.insufficient) return 'needs_review';
  if (s.evidence_absent) return 'unknown';
  if (s.limited) return 'supported_with_limits';
  return 'verified_for_stated_use';
}

// Deterministic mapping from per-claim dispositions to the existing gate
// vocabulary. Blocking triggers mirror the block_on-style rules the wedge
// already applies: an outright 'blocked' disposition, or 'contradicted' at
// critical materiality. 'needs_review' (and 'contradicted') at high+ materiality
// require human review; everything else passes — normal/low-materiality review
// dispositions surface on the claim rows, not the gate.
//
// policy.mode (§11.3): 'advisory' never blocks — enforcing-only verdicts
// downgrade to requires_review with an explicit reason noting advisory mode.
// Any other mode (including absent, i.e. a v1 policy) keeps today's enforcing
// behavior.
export function resolveGate(claimResults, policy = {}) {
  const list = Array.isArray(claimResults) ? claimResults : [];
  const advisory = !!policy && policy.mode === 'advisory';
  const reasons = [];
  let wouldBlock = false;
  let wouldReview = false;
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    const materiality = c.materiality === 'critical' || c.materiality === 'high' ? c.materiality : 'normal';
    const label = `claim ${c.id || i + 1}`;
    if (c.disposition === 'blocked') {
      wouldBlock = true;
      reasons.push(`${label}: blocked by policy prohibition`);
    } else if (c.disposition === 'contradicted' && materiality === 'critical') {
      wouldBlock = true;
      reasons.push(`${label}: contradicted at critical materiality`);
    } else if (c.disposition === 'contradicted' && materiality === 'high') {
      wouldReview = true;
      reasons.push(`${label}: contradicted at high materiality`);
    } else if (c.disposition === 'needs_review' && materiality !== 'normal') {
      wouldReview = true;
      reasons.push(`${label}: needs_review at ${materiality} materiality`);
    }
  }
  if (wouldBlock) {
    if (!advisory) return { gate_decision: 'blocked', reasons };
    reasons.push('advisory mode: blocking verdicts downgraded to requires_review');
    return { gate_decision: 'requires_review', reasons };
  }
  if (wouldReview) return { gate_decision: 'requires_review', reasons };
  return { gate_decision: 'passed', reasons };
}
