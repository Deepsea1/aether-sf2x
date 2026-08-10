// Shared epistemic logic used by backend functions. Mirrors src/lib/sf2x.js for the runtime path.

import { domainGuardrail } from './domainPrompts.js';

export const THINK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'The warranted answer to the inquiry.' },
    cognitive_state: {
      type: 'object',
      properties: {
        working_memory: { type: 'array', items: { type: 'string' }, description: 'Key facts held in working memory while reasoning.' },
        self_model: {
          type: 'object',
          properties: {
            confidence: { type: 'number', description: '0-1 confidence in the final answer.' },
            uncertainty_factors: { type: 'array', items: { type: 'string' } },
          },
          required: ['confidence', 'uncertainty_factors'],
        },
        reasoning_summary: { type: 'string', description: 'A concise trace of the reasoning path.' },
      },
      required: ['working_memory', 'self_model', 'reasoning_summary'],
    },
    warrant: {
      type: 'object',
      properties: {
        premises: { type: 'array', items: { type: 'string' }, description: 'Explicit premises the conclusion depends on.' },
        conclusion: { type: 'string', description: 'The warranted conclusion.' },
        confidence_score: { type: 'number', description: '0-1 warrant confidence.' },
        validity_status: { type: 'string', enum: ['valid', 'weak', 'invalid'] },
        sources: { type: 'array', items: { type: 'string' } },
        expiry_days: { type: 'number', description: 'Days until premises should be revalidated.' },
      },
      required: ['premises', 'conclusion', 'confidence_score', 'validity_status', 'sources', 'expiry_days'],
    },
    metrics: {
      type: 'object',
      properties: {
        confidence_entropy: { type: 'number' },
        expected_calibration_error: { type: 'number' },
        uncorrected_confidence_rate: { type: 'number' },
        false_refusal_rate: { type: 'number' },
        correction_rate: { type: 'number' },
        mean_time_to_correction: { type: 'number' },
        epistemic_drift_score: { type: 'number' },
      },
      required: ['confidence_entropy', 'expected_calibration_error', 'uncorrected_confidence_rate', 'false_refusal_rate', 'correction_rate', 'mean_time_to_correction', 'epistemic_drift_score'],
    },
  },
  required: ['answer', 'cognitive_state', 'warrant', 'metrics'],
};

export function buildThinkPrompt(prompt, domain, stakes, groundingText) {
  const groundingBlock = groundingText
    ? `\nCUSTOMER GROUNDING DOCUMENTS (authoritative for this inquiry — keep your answer consistent with these and cite them where relevant):\n${groundingText}\n`
    : '';
  return `You are the SF2X Epistemic Engine — a governed reasoning system that produces warranted, lineage-tracked answers and never promotes an unwarranted claim.

OPERATING PRINCIPLES
- Think explicitly: surface the working memory and reasoning trace.
- Warrant every conclusion: list the premises it depends on. If premises are uncertain, mark the warrant "weak"; if unsupported, "invalid".
- Calibrate honestly: self-assess epistemic metrics as a rigorous auditor would, not as marketing.
- Prefer refusal over confident wrongness when stakes are high and evidence is thin.

${domainGuardrail(domain)}
${groundingBlock}
INQUIRY
Domain: ${domain || 'general'}
Stakes: ${stakes}
Prompt: """${prompt}"""

Produce a structured response: the answer, the cognitive state (working memory, self-model confidence 0-1 + uncertainty factors, reasoning summary), the Decision Validity Warrant (premises, conclusion, confidence 0-1, validity_status, sources, expiry_days), and epistemic metrics (all 0-1 except mean_time_to_correction in seconds). Be precise, sober, and genuinely useful.`;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

// No deployed AI is 100% correct — reserve the top of the scale for future
// systems. A "perfect" run scores MAX_TRUST_SCORE (95), not 100, leaving
// headroom for growth. Penalties are also tightened (ECE/UCR cost more,
// self-correction is rewarded less) so the bar is genuinely stricter.
export const MAX_TRUST_SCORE = 95;

export function computeTrustworthyRate(metrics, warrant) {
  if (!metrics) return 0;
  let score = 100;
  score -= clamp01(metrics.expected_calibration_error) * 30;
  score -= clamp01(metrics.uncorrected_confidence_rate) * 30;
  score -= clamp01(metrics.false_refusal_rate) * 10;
  score -= clamp01(metrics.epistemic_drift_score) * 20;
  score += clamp01(metrics.correction_rate) * 5;
  score -= Math.min((Number(metrics.mean_time_to_correction) || 0) / 300, 1) * 10;
  if (warrant) {
    if (warrant.validity_status === 'weak') score -= 10;
    else if (warrant.validity_status === 'invalid') score -= 35;
    else if (warrant.validity_status === 'expired') score -= 25;
  }
  return Math.max(0, Math.min(MAX_TRUST_SCORE, Math.round(score)));
}

// New warrants use Ed25519: the private key signs server-side and the public key
// can verify the seal independently. Legacy HMAC and content fingerprints remain
// supported so historical warrants never become unverifiable.
function pemBytes(pem) {
  const body = String(pem || '').replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
  if (!body) return null;
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value || '').length + 3) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function signatureScheme(stored) {
  if (String(stored || '').startsWith('sf2x_ed25519_')) return 'Ed25519';
  if (String(stored || '').startsWith('sf2x_sig_')) return 'HMAC-SHA256';
  return stored ? 'content-fingerprint' : 'none';
}

export async function generateSignature(content, signing = null) {
  const text = String(content ?? '');
  const options = signing && typeof signing === 'object' ? signing : { hmacKey: signing };
  const enc = new TextEncoder();
  if (options.ed25519PrivateKey) {
    const key = await crypto.subtle.importKey('pkcs8', pemBytes(options.ed25519PrivateKey), { name: 'Ed25519' }, false, ['sign']);
    return 'sf2x_ed25519_' + base64Url(await crypto.subtle.sign({ name: 'Ed25519' }, key, enc.encode(text)));
  }
  if (options.hmacKey) {
    const key = await crypto.subtle.importKey('raw', enc.encode(String(options.hmacKey)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return 'sf2x_sig_' + base64Url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  }
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return `sf2x_${fnv(2166136261)}${fnv(1469598103)}`;
}

export async function verifySignature(content, stored, signing = null) {
  const options = signing && typeof signing === 'object' ? signing : { hmacKey: signing };
  const scheme = signatureScheme(stored);
  if (scheme === 'Ed25519') {
    if (!options.ed25519PublicKey) return false;
    const key = await crypto.subtle.importKey('spki', pemBytes(options.ed25519PublicKey), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, base64UrlBytes(String(stored).slice('sf2x_ed25519_'.length)), new TextEncoder().encode(String(content ?? '')));
  }
  if (scheme === 'HMAC-SHA256') return options.hmacKey ? (await generateSignature(content, { hmacKey: options.hmacKey })) === stored : false;
  return scheme === 'content-fingerprint' ? (await generateSignature(content, null)) === stored : false;
}