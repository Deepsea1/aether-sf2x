// OpenRouter multi-provider bridge used by the runModelBench backend function.
// Routes non-native models (Meta, Mistral, xAI, DeepSeek, Qwen, ...) through the
// OpenRouter chat-completions API and normalizes their output into the same
// warranted-JSON shape produced by the native InvokeLLM pipeline.

import { secrets } from 'base44:runtime';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

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
      self_model: { confidence: 0, uncertainty_factors: ['openrouter model returned non-JSON response'] },
      reasoning_summary: reason || 'OpenRouter model did not return the required JSON structure.',
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

// Raw JSON caller for OpenRouter — returns the parsed JSON object as-is (used by
// the tribunal verifier, whose schema is NOT the warranted-answer shape that
// callOpenRouter normalizes into). Strips markdown fences; throws on non-JSON.
export async function callOpenRouterJson(prompt, orModel, userKey) {
  const key = userKey || secrets.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Title': userKey ? 'Aether BYOK' : 'SF2X Tribunal Verifier' },
    body: JSON.stringify({
      model: orModel,
      messages: [{ role: 'user', content: prompt + '\n\nRespond with a single JSON object only — no prose, no markdown fences.' }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('OpenRouter ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const cleaned = stripFences(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('OpenRouter verifier returned non-JSON');
  }
}

export async function callOpenRouter(prompt, orModel) {
  const key = secrets.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'X-Title': 'SF2X Model Arena',
    },
    body: JSON.stringify({
      model: orModel,
      messages: [{ role: 'user', content: prompt + '\n\nRespond with a single JSON object only — no prose, no markdown fences.' }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('OpenRouter ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const cleaned = stripFences(content);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return fallbackShape(content, 'Non-JSON response from OpenRouter model');
  }
  const fb = fallbackShape(content, '');
  return {
    answer: String(parsed.answer || content || '').trim() || fb.answer,
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