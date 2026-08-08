// Canonical 4-role tribunal caveat (Appendix A-3 / Gate 2). Single source of
// truth — every warrant + verify surface imports this so the copy never drifts
// from the hardening spec. The cross-firm segment is templated per run.
//
// A-3 repair: the old copy said "the verifier is an LLM" (singular), which
// understated a multi-role tribunal and oversold independence. This copy names
// all four roles and explicitly disclaims that agreement between them is NOT
// independent confirmation (they share correlated training data).

export const TRIBUNAL_ROLES = ['proposer', 'critic', 'verifier', 'falsifier'];

export function tribunalCaveat({ crossFirmVerified = false } = {}) {
  return `Verified by a multi-role LLM tribunal (proposer, critic, verifier, falsifier) plus an adversarial red-team pass. All roles are language models and may share correlated blind spots from overlapping training data — agreement between them is not independent confirmation. This run was ${crossFirmVerified ? '' : 'not '}cross-firm verified. Treat this score as a vendor claim. See /methodology.`;
}