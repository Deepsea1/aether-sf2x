// Gate 2 — the falsification role + the coverage/detectability check.
// The falsifier is BLIND: it sees the claim text + fetched sources only, never
// the proposer's verdict or the critic's notes. Its sole job is to construct the
// strongest case that the claim is FALSE and report falsification_strength.
// Veto weight (applied in attest.js): falsification_strength "strong" => the
// final verdict caps at "weak" regardless of support ratio, and the argument is
// attached to the warrant verbatim.
//
// The coverage check is a separate lightweight role answering "if this claim
// were FALSE, would the available sources have detected it?" — the negative-
// claim guard. Absence-of-record claims are only as strong as the record's
// coverage; when coverage is thin the tribunal abstains (insufficient_evidence)
// rather than affirming. Together these two give the tribunal a NO and an
// I-DON'T-KNOW before its YES means anything.
//
// Gate 3 (foreign mind): foreignVendor=true routes the falsifier through a
// different vendor's model via OpenRouter (cost-gated) and marks the run
// cross-firm. cross_firm_verified is only true when the foreign role actually ran.

import { callLLMJson } from './llmRouter.js';

export const FALSIFIER_SCHEMA = {
  type: 'object',
  properties: {
    falsification_strength: { type: 'string', enum: ['none', 'weak', 'strong'] },
    argument: { type: 'string', description: 'The strongest case that this claim is FALSE, citing the fetched sources and general knowledge.' },
    load_bearing_claim: { type: 'string', description: 'The single claim whose truth the conclusion most depends on.' },
  },
  required: ['falsification_strength', 'argument'],
};

export const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    detectable: { type: 'boolean', description: 'True if, were the claim false, the available sources would have shown it.' },
    reasoning: { type: 'string' },
  },
  required: ['detectable', 'reasoning'],
};

export function buildFalsifierPrompt(claimText, sources, grounding, domain) {
  const src = (sources || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') || '  (none cited)';
  const ground = grounding && grounding.per_source?.length
    ? `\nFETCHED SOURCE EVIDENCE (server-side fetch + hash at attestation time; match_score 0-1):\n${grounding.per_source.map((s) => `  - ${s.url} [tier ${s.tier}, fetched ${s.fetched}, match ${s.match_score}, status ${s.status}]: ${s.excerpt_found ? 'excerpt found' : 'no excerpt match'}`).join('\n')}\n`
    : '';
  return `You are the SF2X Falsifier — an adversarial role distinct from the red team. Your SOLE job is to construct the strongest case that the following claim is FALSE, using the cited sources and your general knowledge. You do NOT see the proposer's verdict or the critic's notes — you are blind to their conclusions.

DOMAIN: ${domain || 'general'}
CLAIM:
"""${claimText}"""

CITED SOURCES:
${src}${ground}

Construct the strongest argument that this claim is false. If you genuinely cannot build any case (the claim is well-grounded and corroborated by fetched, matched, tier-appropriate sources), report falsification_strength: "none". If there is a plausible but inconclusive counter-case, "weak". If you can build a strong, evidence-backed case that the claim is false (contradiction, fabrication, wrong entity/date/polarity, or the cited sources do not actually support it when fetched), "strong". Also identify the single load-bearing claim whose truth the conclusion most depends on. Be rigorous and impartial. Respond as a single JSON object.`;
}

export function buildCoveragePrompt(claimText, sources, grounding, domain) {
  const src = (sources || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') || '  (none cited)';
  const ground = grounding && grounding.per_source?.length
    ? `\nFETCHED SOURCE EVIDENCE:\n${grounding.per_source.map((s) => `  - ${s.url} [fetched ${s.fetched}, match ${s.match_score}]`).join('\n')}\n`
    : '';
  return `You are the SF2X Coverage Checker. Answer one question: if this claim were FALSE, would the available sources have detected it?

This is the negative-claim guard: absence-of-record claims ("no record places X near Y") are only as strong as the record's coverage. If the sources would NOT have recorded the counter-fact (thin coverage, no registry, no archive, no public log), the claim is undetectable-if-false and the tribunal must abstain rather than affirm.

DOMAIN: ${domain || 'general'}
CLAIM:
"""${claimText}"""

AVAILABLE SOURCES:
${src}${ground}

Respond: detectable (boolean) + reasoning. Be strict — when in doubt about whether the record would have captured the counter-fact, answer detectable=false. Respond as a single JSON object.`;
}

// Run the falsifier. foreignVendor=true routes through a different vendor's
// model via OpenRouter (Gate 3, cost-gated) and marks the run cross-firm.
export async function runFalsifier(svc, { claimText, sources, grounding, domain, foreignVendor = false }) {
  const orModel = foreignVendor ? 'openai/gpt-4o' : 'anthropic/claude-3.5-sonnet';
  try {
    const v = await callLLMJson(svc, {
      prompt: buildFalsifierPrompt(claimText, sources, grounding, domain),
      schema: FALSIFIER_SCHEMA,
      orModel,
      allowFallback: true,
    });
    const strength = ['none', 'weak', 'strong'].includes(v.falsification_strength) ? v.falsification_strength : 'none';
    return {
      falsification_strength: strength,
      argument: String(v.argument || '').slice(0, 2000),
      load_bearing_claim: String(v.load_bearing_claim || '').slice(0, 1000),
      vendor: foreignVendor ? 'openai-via-openrouter' : 'anthropic-via-openrouter',
      model: orModel,
      cross_firm: !!foreignVendor,
      ran: true,
    };
  } catch (e) {
    return { falsification_strength: 'none', argument: `Falsifier failed: ${String(e?.message || e).slice(0, 200)}`, load_bearing_claim: '', vendor: null, model: orModel, cross_firm: false, ran: false, error: String(e?.message || e) };
  }
}

export async function runCoverageCheck(svc, { claimText, sources, grounding, domain }) {
  try {
    // Coverage is a lightweight detectability gate (not a verdict role) — a
    // cheap model is sufficient and keeps cost off the critical path. The
    // verifier + falsifier carry the reasoning weight; this only answers
    // "would the record have caught a lie".
    const v = await callLLMJson(svc, {
      prompt: buildCoveragePrompt(claimText, sources, grounding, domain),
      schema: COVERAGE_SCHEMA,
      orModel: 'openai/gpt-4o-mini',
      allowFallback: true,
    });
    return { detectable: v.detectable !== false, reasoning: String(v.reasoning || '').slice(0, 1000), ran: true };
  } catch (e) {
    // Default detectable=true on failure so a coverage-role outage never turns
    // every claim into an abstention.
    return { detectable: true, reasoning: `Coverage check failed: ${String(e?.message || e).slice(0, 200)}`, ran: false };
  }
}