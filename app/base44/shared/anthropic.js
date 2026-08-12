// Direct Anthropic API bridge — calls Claude models straight from the app's
// own ANTHROPIC_API_KEY (0 Base44 credits, 0 OpenRouter markup). Used as the
// PRIMARY path for Claude-family models; OpenRouter handles non-Claude models
// and Base44 InvokeLLM is the last-resort fallback.

import { secrets } from 'base44:runtime';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Workhorse model for every verification role. Was pinned to
// 'claude-3-5-sonnet-20241022' — a build from October 2024 that is no longer
// served. That is why tier 1 silently threw on every call and the router fell
// all the way through to Base44 InvokeLLM, where it hit the exhausted
// integration quota: the negative-control gate reported "You have reached the
// limit of integrations for this month" on every TRUE claim, which looked like
// a credit problem and was actually a dead model id. Note the old map sent even
// 'claude-sonnet-5' to the 2024 build, so asking for a current model got a
// retired one.
const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8192;

// Map the app's native Claude model identifiers to Anthropic API model IDs.
// The legacy `claude_*` keys are Base44 platform labels, not capability
// requests — they have always collapsed to a single default, so they keep
// doing that. Callers naming a model directly get that model.
export const CLAUDE_MODEL_MAP = {
  claude_opus_4_8: DEFAULT_MODEL,
  claude_sonnet_4_6: DEFAULT_MODEL,
  automatic: DEFAULT_MODEL,
  'claude-sonnet-5': 'claude-sonnet-5',
  'claude-opus-5': 'claude-opus-5',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

export function isClaudeModel(modelValue) {
  return Object.prototype.hasOwnProperty.call(CLAUDE_MODEL_MAP, modelValue);
}

function stripFences(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return t;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fallbackShape(content, reason) {
  const text = String(content || '').trim();
  return {
    answer: text || '(no answer)',
    cognitive_state: {
      working_memory: [],
      self_model: { confidence: 0, uncertainty_factors: ['anthropic returned non-JSON response'] },
      reasoning_summary: reason || 'Anthropic model did not return the required JSON structure.',
    },
    warrant: {
      premises: [],
      conclusion: text.slice(0, 500),
      confidence_score: 0,
      validity_status: 'weak',
      sources: [],
      expiry_days: 30,
    },
    metrics: {
      confidence_entropy: 0.5,
      expected_calibration_error: 0.5,
      uncorrected_confidence_rate: 0.5,
      false_refusal_rate: 0,
      correction_rate: 0,
      mean_time_to_correction: 0,
      epistemic_drift_score: 0.5,
    },
  };
}

async function rawCall(prompt, modelId, userKey) {
  const key = userKey || secrets.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt + '\n\nRespond with a single JSON object only — no prose, no markdown fences.' }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('Anthropic ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text || '';
  return stripFences(content);
}

// Raw JSON caller — returns the parsed JSON object as-is (used by the tribunal
// verifier whose schema is NOT the warranted-answer shape). Throws on non-JSON.
export async function callAnthropicJson(prompt, modelValue, userKey) {
  const modelId = CLAUDE_MODEL_MAP[modelValue] || DEFAULT_MODEL;
  const cleaned = await rawCall(prompt, modelId, userKey);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Anthropic returned non-JSON');
  }
}

// Warranted-answer shape caller — mirrors callOpenRouter's normalization so
// tribunal answerers/reconcilers get the same structure from either provider.
export async function callAnthropic(prompt, modelValue) {
  const modelId = CLAUDE_MODEL_MAP[modelValue] || DEFAULT_MODEL;
  const cleaned = await rawCall(prompt, modelId);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return fallbackShape(cleaned, 'Non-JSON response from Anthropic');
  }
  const fb = fallbackShape(cleaned, '');
  return {
    answer: String(parsed.answer || cleaned || '').trim() || fb.answer,
    cognitive_state: parsed.cognitive_state || fb.cognitive_state,
    warrant: {
      premises: Array.isArray(parsed.warrant?.premises) ? parsed.warrant.premises : [],
      conclusion: parsed.warrant?.conclusion || fb.warrant.conclusion,
      confidence_score: num(parsed.warrant?.confidence_score),
      validity_status: ['valid', 'weak', 'invalid'].includes(parsed.warrant?.validity_status) ? parsed.warrant.validity_status : 'weak',
      sources: Array.isArray(parsed.warrant?.sources) ? parsed.warrant.sources : [],
      expiry_days: Number.isFinite(Number(parsed.warrant?.expiry_days)) ? num(parsed.warrant.expiry_days) : 30,
    },
    metrics: parsed.metrics
      ? {
          confidence_entropy: num(parsed.metrics.confidence_entropy),
          expected_calibration_error: num(parsed.metrics.expected_calibration_error),
          uncorrected_confidence_rate: num(parsed.metrics.uncorrected_confidence_rate),
          false_refusal_rate: num(parsed.metrics.false_refusal_rate),
          correction_rate: num(parsed.metrics.correction_rate),
          mean_time_to_correction: num(parsed.metrics.mean_time_to_correction),
          epistemic_drift_score: num(parsed.metrics.epistemic_drift_score),
        }
      : fb.metrics,
  };
}