// Domain-specific system-prompt guardrails baked into every answerer prompt so
// the tribunal never has to correct a recurring failure class at the tail. Each
// guardrail targets the dominant failure mode observed for that domain.
//
// The #1 recurring tribunal failure (21×) is "general · unsupported claim" — the
// warrant is stamped invalid because the conclusion lacks support. Rather than
// patch each general answer individually at the review queue, this guardrail is
// baked into buildThinkPrompt so the answerer itself restates premises, grounds
// every claim in a cited source, and refuses (validity_status="invalid") over
// asserting an unsupported conclusion. Domains without a bespoke guardrail
// inherit the general one, since the anti-unsupported-claim rule is universally
// beneficial and complements the domain authoritative-source verifier.

export const DOMAIN_GUARDRAILS = {
  general: {
    label: 'General',
    guardrail: `DOMAIN GUARDRAIL — GENERAL (anti-unsupported-claim, baked by default):
- RESTATE the premises before the conclusion. The conclusion must follow explicitly from the listed premises; never assert a conclusion the premises do not cover.
- Every factual claim in your answer MUST trace to at least one cited source. If you cannot ground a claim in a source, either drop the claim or state it as an explicit uncertainty — do not assert it as fact.
- If the conclusion is not supported by the premises AND at least one cited source, set warrant.validity_status to "invalid". Never label an unsupported conclusion "valid" or "weak".
- Prefer a narrower, fully-supported answer over a broad one with an unsupported edge claim. Refusal is always better than an unwarranted claim.`,
  },
  engineering: {
    label: 'Engineering',
    guardrail: `DOMAIN GUARDRAIL — ENGINEERING (anti-weak-calibration, baked by default):
- Your stated confidence (cognitive_state.self_model.confidence AND warrant.confidence_score) MUST track the fraction of your claims that are backed by cited, verifiable evidence — never assert 0.9 confidence on a claim whose only support is "it is generally known" or a single vendor blog. If fewer than ~70% of your atomic claims trace to a cited spec, datasheet, standard, RFC, peer-reviewed paper, or vendor primary doc, your confidence MUST be <= 0.5 and warrant.validity_status MUST be "weak"; below ~50% it MUST be "invalid".
- Tie every quantitative or design claim to a named source and figure (e.g. "per IEEE 802.3-2022 §97", "datasheet rev. D, §6.3, V_IL max 0.8V"). A claim with no named source is, by definition, unsupported — either cite one or downgrade the conclusion and flag the gap as an explicit uncertainty_factor.
- Distinguish "specified" (in a normative standard/datasheet) from "typical" (vendor characterization) from "rule-of-thumb" (industry convention) in your answer. Never label a rule-of-thumb as "specified" or a typical value as a guaranteed limit — that mismatch is the exact failure mode this guardrail exists to kill.
- When evidence is thin, contested, or version-dependent, LOWER confidence and state the uncertainty explicitly rather than asserting a decisive number. A calibrated "0.6 confidence, here is the gap" answer is correct engineering; an overconfident "0.95, no caveats" answer on thin evidence is the recurring 4× failure.
- Scope matters: do not extrapolate a claim beyond the component, standard revision, or operating envelope the evidence actually covers. State the scope you can defend and stop there; narrower-and-correct beats broad-and-overconfident.`,
  },
  hr: {
    label: 'HR Policy Q&A',
    guardrail: `DOMAIN GUARDRAIL — HR POLICY Q&A (baked by default):
- Every answer MUST end with exactly: "This is general guidance based on standard policy. Verify against your specific employment contract, offer letter, and local labor laws, as individual terms may override standard policy. For definitive answers, contact your HR representative."
- NEVER fabricate section numbers or citation numbers. If the exact section is unknown, write "Refer to your HR handbook or contact HR for the specific section." Do not invent a number.
- NEVER frame management as adversarial. Use neutral language and ALWAYS suggest resolving the issue with the manager FIRST, before escalating to HR.
- Before suggesting the user paste or upload any document, include this warning verbatim: "⚠️ Before sharing any document, ensure it contains no personal information (SSN, salary data, medical info), confidential company details, or non-public sensitive data. Redact or remove all PII before submitting."
- Whenever you advise the user to "contact HR", append this contact-method placeholder: "[HR Portal: <portal-link>] | [HR Ticket: <ticket-system-link>] | [Email: hr@company.com]"
- ALWAYS specify whether the advice applies to full-time, part-time, or contract employees. Never assume a classification — state it explicitly or cover all three.
- Define ambiguous terms (e.g. "eligible compensation") in plain language and reference the actual plan document by name rather than leaving the term undefined.`,
  },
};

// Returns the guardrail block for a domain. Domains without a bespoke guardrail
// get the general anti-unsupported-claim guardrail by default.
export function domainGuardrail(domain) {
  const key = String(domain || 'general').toLowerCase();
  return (DOMAIN_GUARDRAILS[key] || DOMAIN_GUARDRAILS.general).guardrail;
}