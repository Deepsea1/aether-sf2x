// Shared multi-model tribunal logic for the hardened 3-way answer pipeline.
// Three independent AIs answer -> each is cross-examined by a DIFFERENT family
// -> each reconciles with its own critic -> a cross-firm verifier ranks the
// initials and synthesizes one hardened answer. The hardened answer is then
// attested through the existing web-grounded verification pipeline (validity,
// trust, source snapshots), and corroboration across the three initial answers
// is recorded on the warrant. Every initial answer is persisted to the
// benchmark (ModelBenchRun) so no model call is lost.

import { buildThinkPrompt, THINK_JSON_SCHEMA } from './sf2xCore.js';
import { ALL_MODELS } from './sf2xBench.js';
import { callOpenRouter, callOpenRouterJson } from './openrouter.js';
import { callAnthropic, callAnthropicJson, isClaudeModel } from './anthropic.js';

export const MODEL_MAP = new Map(ALL_MODELS.map((m) => [m.value, m]));

// OpenRouter-first routing: every native Base44 model has an OpenRouter
// equivalent. The tribunal call functions below try OpenRouter first (0 Base44
// integration credits) and fall back to Base44 InvokeLLM only on failure —
// the last resort, not the default. This keeps cross-firm diversity intact
// (different OR families) while preserving credits during the current
// integration-credit exhaustion window.
export const NATIVE_TO_OR = {
  gemini_3_flash: 'google/gemini-flash-1.5',
  gemini_3_1_pro: 'google/gemini-2.5-pro',
  gpt_5_mini: 'openai/gpt-4o-mini',
  gpt_5_4: 'openai/gpt-4o',
  gpt_5_6_sol: 'openai/gpt-4o',
  claude_opus_4_8: 'anthropic/claude-3.5-sonnet',
  'claude-sonnet-5': 'anthropic/claude-3.5-sonnet',
  claude_sonnet_4_6: 'anthropic/claude-3.5-sonnet',
  automatic: 'anthropic/claude-3.5-sonnet',
};

// Asymmetric routing: mid-tier proposers from 3 independent labs (Google,
// OpenAI, DeepSeek). The adversarial roles — verifier, falsifier, coverage —
// stay on best-AI (Claude Opus 4.8 / GPT-4o) so every lie gets caught by a
// top-tier model even though the answer was written by a cheaper one.
// See base44/shared/modelRouting.js for the full role assignment + rationale.
export const DEFAULT_TRIO = ['gemini_3_flash', 'gpt_5_mini', 'or_deepseek_v3'];

// Verifier output: ranks the 3 initial candidates + synthesizes the hardened answer.
export const TRIBUNAL_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Initial candidate id: m0, m1, or m2.' },
          correctness: { type: 'number', description: '0-1 factual + epistemic correctness.' },
          notes: { type: 'string' },
        },
        required: ['id', 'correctness'],
      },
    },
    winner_ids: { type: 'array', items: { type: 'string' }, description: 'Initial ids within 0.03 of the top correctness (ties allowed).' },
    hardened_answer: { type: 'string', description: 'The synthesized hardened answer inheriting the strongest premises + best-corroborated sources.' },
    premises: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' }, description: 'Union of cited sources across candidates, deduped.' },
    confidence_score: { type: 'number', description: 'Verifier confidence in the hardened answer 0-1.' },
    merge_notes: { type: 'string', description: 'What was taken from which candidate and why.' },
  },
  required: ['rankings', 'winner_ids', 'hardened_answer', 'premises', 'sources', 'confidence_score'],
};

export const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    restated: { type: 'string', description: 'The answer restated in the critic own words.' },
    objections: { type: 'array', items: { type: 'string' } },
    risks: { type: 'string', description: 'The strongest counter-argument or risk.' },
    verdict: { type: 'string', enum: ['holds', 'contested', 'fails'] },
  },
  required: ['restated', 'objections', 'risks', 'verdict'],
};

export function familyOf(modelValue) {
  return MODEL_MAP.get(modelValue)?.tag || 'Base44';
}

export function modelLabel(modelValue) {
  return MODEL_MAP.get(modelValue)?.label || modelValue;
}

// Normalize a user-supplied trio to exactly 3 valid, deduped models (fills from
// the default trio when missing). Cross-firm is preferred but not forced — the
// user can pick any three.
export function resolveTrio(models) {
  let trio = Array.isArray(models) ? models.filter((m) => MODEL_MAP.has(m)) : [];
  if (trio.length === 0) trio = [...DEFAULT_TRIO];
  trio = [...new Set(trio)].slice(0, 3);
  while (trio.length < 3) {
    const next = DEFAULT_TRIO.find((d) => !trio.includes(d));
    if (!next) break;
    trio.push(next);
  }
  return trio.slice(0, 3);
}

// Resolve exactly 2 cross-firm models for the fast tribunal path (medium stakes).
export function resolveDuo(models) {
  let duo = Array.isArray(models) ? models.filter((m) => MODEL_MAP.has(m)) : [];
  if (duo.length < 2) duo = [...DEFAULT_TRIO];
  duo = [...new Set(duo)].slice(0, 2);
  while (duo.length < 2) {
    const next = DEFAULT_TRIO.find((d) => !duo.includes(d));
    if (!next) break;
    duo.push(next);
  }
  return duo.slice(0, 2);
}

// Pick a critique model for an answer: a NATIVE model from a DIFFERENT family
// than the one that wrote it (so no model ever grades its own output). Prefers a
// model that is not itself one of the three answerers.
export function pickCritiqueModel(answerModel, answerers = []) {
  const fam = familyOf(answerModel);
  const answererSet = new Set(answerers);
  const native = ALL_MODELS.filter((m) => !m.openrouter && m.value !== 'automatic' && familyOf(m.value) !== fam);
  return (native.find((m) => !answererSet.has(m.value)) || native[0] || { value: 'claude_sonnet_4_6' }).value;
}

// Pick N cross-firm verifier models that are NOT among the answerers (different
// labs, so the synthesis/ranking is independent of every candidate author).
export function pickVerifiers(answerModels, n = 1) {
  const fams = new Set(answerModels.map(familyOf));
  // Include OpenRouter-routed models so a cross-firm verifier exists even when the
  // trio covers all native labs (OpenAI/Google/Anthropic) — xAI, Mistral, DeepSeek…
  const pool = ALL_MODELS.filter((m) => m.value !== 'automatic' && !fams.has(familyOf(m.value)));
  // Best-AI verifier first (Claude Opus 4.8) — the catching role that matters
  // most for truthfulness. With the asymmetric proposer trio
  // (Google/OpenAI/DeepSeek), Anthropic is always free for cross-firm verification.
  const preferred = ['claude_opus_4_8', 'claude-sonnet-5', 'gemini_3_1_pro', 'gpt_5_6_sol', 'claude_sonnet_4_6', 'or_grok_4_3', 'or_mistral_large', 'or_deepseek_v3', 'or_cohere_rplus'];
  const chosen = [];
  for (const p of preferred) {
    if (chosen.length >= n) break;
    if (pool.some((m) => m.value === p)) chosen.push(p);
  }
  let i = 0;
  while (chosen.length < n && i < pool.length) {
    const v = pool[i].value;
    if (!chosen.includes(v)) chosen.push(v);
    i++;
  }
  return chosen;
}

// Unified answer caller — 3-tier fallback:
//   1. Anthropic direct (Claude models only, 0 Base44 credits, 0 OR markup)
//   2. OpenRouter (0 Base44 credits, small OR markup)
//   3. Base44 InvokeLLM (last resort, costs credits)
// Answerers run WITHOUT web grounding — independence is preserved; the verifier
// + attestation step do the web grounding.
export async function callAnswerer(svc, modelValue, prompt) {
  const entry = MODEL_MAP.get(modelValue);
  if (!entry) throw new Error('unknown model ' + modelValue);
  const t0 = Date.now();
  let r;
  if (isClaudeModel(modelValue)) {
    try { r = await callAnthropic(prompt, modelValue); }
    catch (e) { r = await _orFallback(svc, prompt, modelValue, entry); }
  } else if (entry.openrouter) {
    r = await callOpenRouter(prompt, entry.or_model);
  } else {
    r = await _orFallback(svc, prompt, modelValue, entry);
  }
  return { r, latency_ms: Date.now() - t0 };
}

// Shared OR → Base44 fallback for the warranted-shape calls.
async function _orFallback(svc, prompt, modelValue, entry) {
  if (entry?.openrouter) return await callOpenRouter(prompt, entry.or_model);
  const orModel = NATIVE_TO_OR[modelValue];
  if (orModel) {
    try { return await callOpenRouter(prompt, orModel); }
    catch (e) { return await _b44Invoke(svc, prompt, THINK_JSON_SCHEMA, modelValue); }
  }
  return await _b44Invoke(svc, prompt, THINK_JSON_SCHEMA, modelValue);
}

// Reconciliation caller — 3-tier: Anthropic direct → OpenRouter → Base44.
// Returns the same warranted-JSON shape from all three providers.
export async function callReconcile(svc, modelValue, prompt) {
  const t0 = Date.now();
  const r = await _warrantedCall(svc, modelValue, prompt);
  return { r, latency_ms: Date.now() - t0 };
}

// Critique caller — 3-tier (raw JSON): Anthropic → OpenRouter → Base44.
export async function callCritique(svc, modelValue, prompt) {
  if (isClaudeModel(modelValue)) {
    try { return { v: await callAnthropicJson(prompt, modelValue), latency_ms: null }; }
    catch (e) { /* fall through to OR/Base44 */ }
  }
  const entry = MODEL_MAP.get(modelValue);
  if (entry?.openrouter) {
    try { return { v: await callOpenRouterJson(prompt, entry.or_model), latency_ms: null }; }
    catch (e) { /* fall through to Base44 */ }
  } else {
    const orModel = NATIVE_TO_OR[modelValue];
    if (orModel) {
      try { return { v: await callOpenRouterJson(prompt, orModel), latency_ms: null }; }
      catch (e) { /* fall through to Base44 */ }
    }
  }
  const v = await _b44Invoke(svc, prompt, CRITIQUE_SCHEMA, modelValue);
  return { v, latency_ms: null };
}

// Cross-firm rank + merge verifier — 3-tier (raw JSON): Anthropic → OpenRouter →
// Base44. No web (cross-firm constraint); the attestation step grounds the
// hardened answer against the web separately.
export async function callVerifier(svc, modelValue, prompt) {
  if (isClaudeModel(modelValue)) {
    try { return await callAnthropicJson(prompt, modelValue); }
    catch (e) { /* fall through to OR/Base44 */ }
  }
  const entry = MODEL_MAP.get(modelValue);
  if (entry?.openrouter) {
    try { return await callOpenRouterJson(prompt, entry.or_model); }
    catch (e) { /* fall through to Base44 */ }
  } else {
    const orModel = NATIVE_TO_OR[modelValue];
    if (orModel) {
      try { return await callOpenRouterJson(prompt, orModel); }
      catch (e) { /* fall through to Base44 */ }
    }
  }
  return _b44Invoke(svc, prompt, TRIBUNAL_VERDICT_SCHEMA, modelValue);
}

// Base44 InvokeLLM — the last-resort fallback. Only reached when OpenRouter is
// unavailable or fails. Costs integration credits; kept as the safety net.
async function _b44Invoke(svc, prompt, schema, modelValue) {
  const params = { prompt, response_json_schema: schema };
  if (modelValue && modelValue !== 'automatic') params.model = modelValue;
  const res = await svc.integrations.Core.InvokeLLM(params);
  return res && res.data ? res.data : res;
}

export function buildCritiquePrompt(question, answerText, answerModel, domain, stakes) {
  return `You are the SF2X cross-examiner — an independent critic from a DIFFERENT model family than ${answerModel}, which wrote this answer. Your job is to pressure-test it, not to be nice.

QUESTION:
"""${question}"""

ANSWER (written by ${answerModel}):
"""${answerText}"""

DOMAIN: ${domain || 'general'} · STAKES: ${stakes}

Restate the answer in your own words, then surface specific objections (unsupported claims, overconfidence, missing premises, stale evidence, scope errors), the strongest risk, and a verdict: holds / contested / fails. Be rigorous and terse. Respond as a single JSON object.`;
}

export function buildReconcilePrompt(question, originalAnswer, critique, domain, stakes) {
  return `You are the SF2X Epistemic Engine revising your earlier answer after an independent critic challenged it. Reconcile honestly: concede where the critic is right, defend where you were correct, and produce an improved warranted answer.

QUESTION:
"""${question}"""

YOUR ORIGINAL ANSWER:
"""${originalAnswer}"""

CRITIC CHALLENGE:
"""${critique}"""

DOMAIN: ${domain || 'general'} · STAKES: ${stakes}

Produce the same structured response as a fresh warranted answer: answer, cognitive_state (working_memory, self_model {confidence, uncertainty_factors}, reasoning_summary), warrant (premises, conclusion, confidence_score, validity_status, sources, expiry_days), and metrics (0-1 except mean_time_to_correction in seconds). Only change your conclusion if the critique actually warrants it — do not cave to a wrong objection.`;
}

export function buildMergePrompt(question, candidates, domain, stakes) {
  const block = candidates
    .map((c) => `${c.id} (${c.model}, ${c.phase}):\n"""${c.answer || ''}"""`)
    .join('\n\n');
  return `You are the SF2X Tribunal Verifier — an independent adjudicator from a lab that did NOT write any candidate. Three AIs answered the same question independently, then each was cross-examined by a different family and reconciled. Synthesize one hardened answer and rank the three initial answers.

QUESTION:
"""${question}"""

CANDIDATES (initial answers m0/m1/m2 + reconciled revisions r0/r1/r2):
${block}

DOMAIN: ${domain || 'general'} · STAKES: ${stakes}

Your job:
1. Rank the THREE INITIAL candidates (ids m0, m1, m2) for factual + epistemic correctness (0-1). Set winner_ids to every initial id within 0.03 of the top score (ties allowed).
2. Synthesize a single HARDENED answer that inherits the strongest premises and best-corroborated sources from across all candidates. Do not invent new claims — only include claims backed by at least one candidate, and prefer claims backed by multiple.
3. List the union of all cited sources (deduped) and premises the hardened answer depends on, a confidence 0-1, and merge_notes explaining what you took from whom.

Be strict and impartial. Respond as a single JSON object.`;
}

// Fast tribunal verifier prompt — ranks 2 initial candidates and synthesizes one hardened answer.
export function buildFastMergePrompt(question, candidates, domain, stakes) {
  const block = candidates
    .map((c) => `${c.id} (${c.model}, ${c.phase}):\n"""${c.answer || ''}"""`)
    .join('\n\n');
  return `You are the SF2X Tribunal Verifier — an independent adjudicator from a lab that did NOT write any candidate. Two AIs answered the same question independently. Synthesize one hardened answer and rank the two initial answers.

QUESTION:
"""${question}"""

CANDIDATES (initial answers m0, m1):
${block}

DOMAIN: ${domain || 'general'} · STAKES: ${stakes}

Your job:
1. Rank the TWO INITIAL candidates (ids m0, m1) for factual + epistemic correctness (0-1). Set winner_ids to every initial id within 0.03 of the top score (ties allowed).
2. Synthesize a single HARDENED answer that inherits the strongest premises and best-corroborated sources from across both candidates. Do not invent new claims — only include claims backed by at least one candidate, and prefer claims backed by both.
3. List the union of all cited sources (deduped) and premises the hardened answer depends on, a confidence 0-1, and merge_notes explaining what you took from whom.

Be strict and impartial. Respond as a single JSON object.`;
}

// Corroboration: distinct source URLs cited by >=2 of the initial answers.
export function corroboratingSources(initialResults) {
  const lists = initialResults
    .map((a) => [...new Set((a.warrant?.sources || []).map((s) => String(s).trim()).filter(Boolean))]);
  const counts = new Map();
  for (const l of lists) for (const s of l) counts.set(s, (counts.get(s) || 0) + 1);
  const corroborated = [...counts.entries()].filter(([, c]) => c >= 2).map(([s]) => s);
  const all = [...new Set(lists.flat())];
  return {
    count: corroborated.length,
    total_sources: all.length,
    total_models: lists.length,
    sources: corroborated,
  };
}