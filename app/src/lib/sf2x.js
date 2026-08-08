export const METRIC_DEFS = [
  { key: 'confidence_entropy', label: 'Confidence Entropy', abbr: 'CE', unit: 'pct', lowerBetter: true, desc: 'Dispersion of confidence across claims; lower = sharper.' },
  { key: 'expected_calibration_error', label: 'Expected Calibration Error', abbr: 'ECE', unit: 'pct', lowerBetter: true, desc: 'Gap between stated confidence and actual accuracy.' },
  { key: 'uncorrected_confidence_rate', label: 'Uncorrected Confidence Rate', abbr: 'UCR', unit: 'pct', lowerBetter: true, desc: 'High-confidence claims left uncorrected.' },
  { key: 'false_refusal_rate', label: 'False Refusal Rate', abbr: 'FRR', unit: 'pct', lowerBetter: true, desc: 'Valid answers the system refused to give.' },
  { key: 'correction_rate', label: 'Correction Rate', abbr: 'CR', unit: 'pct', lowerBetter: false, desc: 'Fraction of detected errors self-corrected.' },
  { key: 'mean_time_to_correction', label: 'Mean Time To Correction', abbr: 'MTTC', unit: 'sec', lowerBetter: true, desc: 'Average seconds to fix a detected error.' },
  { key: 'epistemic_drift_score', label: 'Epistemic Drift Score', abbr: 'EDS', unit: 'pct', lowerBetter: true, desc: 'Instability of beliefs over time.' },
];

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

export function buildThinkPrompt(prompt, domain, stakes) {
  return `You are the SF2X Epistemic Engine — a governed reasoning system that produces warranted, lineage-tracked answers and never promotes an unwarranted claim.

OPERATING PRINCIPLES
- Think explicitly: surface the working memory and reasoning trace.
- Warrant every conclusion: list the premises it depends on. If premises are uncertain, mark the warrant "weak"; if unsupported, "invalid".
- Calibrate honestly: self-assess epistemic metrics as a rigorous auditor would, not as marketing.
- Prefer refusal over confident wrongness when stakes are high and evidence is thin.

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

export function metricDisplay(value, def) {
  if (value == null) return '—';
  if (def.unit === 'sec') return `${Math.round(value)}s`;
  return `${Math.round(clamp01(value) * 100)}%`;
}

// Content-bound attestation fingerprint (frontend mirror): deterministic for a given warrant
// payload so tampering with premises/conclusion changes the hash. The backend signs with HMAC
// when SF2X_ATTESTATION_KEY is set; this keeps console-created warrants tamper-evident too.
export function generateSignature(content) {
  const s = String(content ?? '');
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return `sf2x_${fnv(2166136261)}${fnv(1469598103)}`;
}

export function timeUntilExpiry(expiryDate) {
  if (!expiryDate) return { expired: false, label: '—' };
  const diff = new Date(expiryDate).getTime() - Date.now();
  if (diff <= 0) return { expired: true, label: 'Expired' };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return { expired: false, label: days > 0 ? `${days}d ${hours}h` : `${hours}h` };
}

export const VALIDITY_STYLES = {
  valid: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/30', label: 'Valid' },
  weak: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/30', label: 'Weak' },
  invalid: { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-400/30', label: 'Invalid' },
  expired: { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-400/30', label: 'Expired' },
};