import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { callLLMJson } from '../../shared/llmRouter.js';
import { validateWebhookUrl, guardedPost } from '../../shared/webhooks.js';

// webhookVerify — the async webhook verification endpoint documented in
// docs/API_REFERENCE.md ("Webhook Verification": one text → tribunal verdict →
// POST to a caller-supplied webhook_url). This file brings the previously
// repo-less DEPLOYED endpoint under version control — until now /webhookVerify
// existed only as a directly-deployed Base44 function (2026-08-09) with no
// source in this repo and an unverifiable SSRF posture. Deploying this file
// REPLACES the live endpoint and MUST be tested on Base44 first (happy path
// plus a blocked webhook_url probe, e.g. http://169.254.169.254/).
//
// The webhook_url is an SSRF vector by construction (MASTER_PLAN v5 §16.1), so
// it is validated (scheme allowlist, credential rejection, private/metadata-host
// blocklist, fail-closed DNS) BEFORE any LLM spend — an invalid URL costs the
// caller nothing — and delivered via the shared guardedPost (manual redirect
// following, per-hop re-validation, 5-hop cap). Bills the same unit cost as
// verifyResponse: one tribunal run per call. The prompt, schema, and enforced
// guardrails below mirror verifyResponse (tribunal 2.1.0-hr-guardrails) so
// identical text scores identically on both endpoints — keep them in sync when
// verifyResponse's pipeline evolves. Deliberately omitted vs verifyResponse:
// cache, BYOK, grounding docs, and the red-team certification pass — none are
// part of the documented webhook contract, and omitting the red-team call keeps
// spend at or below /verifyResponse.

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean', description: 'true if likely true / well-grounded.' },
          notes: { type: 'string' },
        },
        required: ['claim', 'supported'],
      },
    },
    corrections: { type: 'array', items: { type: 'string' }, description: 'Concrete factual issues or unsupported claims an expert would flag.' },
    verdict: { type: 'string', enum: ['verified', 'contested', 'rejected'] },
    trust_score: { type: 'number', description: 'Calibrated 0-100. Never 100; reserve ≥90 for reputation-staking claims.' },
    summary: { type: 'string' },
  },
  required: ['claims', 'corrections', 'verdict', 'trust_score'],
};

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
    const webhookUrl = String(body.webhook_url || '').trim();
    if (!webhookUrl) return Response.json({ error: 'webhook_url is required' }, { status: 400 });
    const domain = String(body.domain || 'General');

    // Webhook delivery to arbitrary URLs is never anonymous — require a key.
    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) {
      return Response.json({ error: 'Monthly verification quota exceeded', plan: quota.plan, limit: quota.limit, remaining: 0 }, { status: 429 });
    }

    // SSRF gate FIRST — reject a blocked/invalid webhook_url before the
    // (expensive) verification runs, so probing internal addresses costs
    // nothing. guardedPost re-validates at delivery time (defense in depth).
    const urlCheck = await validateWebhookUrl(webhookUrl);
    if (!urlCheck.ok) return Response.json({ error: `invalid webhook_url: ${urlCheck.error}` }, { status: 400 });

    const prompt = `You are the Aether verification engine — a fast, impartial tribunal that checks an AI-generated text for hallucinations in real time. Act as proposer, critic, and verifier in a single pass.

TEXT TO VERIFY:
"""${text}"""

DOMAIN: ${domain}
Your job:
1. Decompose the text into its discrete factual claims.
2. For each claim, judge whether it is supported (likely true / well-grounded) or unsupported (fabricated, overconfident, stale, or wrong).
3. List specific corrections — concrete factual issues an expert would flag, written as short sentences.
4. Render a verdict: "verified" (trustworthy, no material issues), "contested" (partly right but has problems), or "rejected" (materially wrong / hallucinated).
5. Assign a calibrated trust score 0-100. Be strict: a perfect 100 is never warranted; reserve ≥90 only for claims you would stake a professional reputation on.

SCORING — deduct points ONLY for:
- Factual errors (unsupported claims): -10 per claim
- Fabricated/hallucinated citations: -15 per citation
- Absolute/overgeneralized claims without hedging: -10
- Missing required guardrails (PII warning, HR contact, disclaimer): -10 each
- Adversarial tone: -5

IMPORTANT: Corrections are ONLY for factual errors, fabricated citations, missing required guardrails, absolute claims, or adversarial tone. Do NOT list "suggestions for improvement" or "additional context you could add" as corrections. Specifically, do NOT deduct points for:
- "You could also mention X" (suggestions are NOT corrections)
- "Clarify Y" when the answer is already factually correct
- "Add more detail about Z" when the answer is comprehensive enough
- "Note that..." nice-to-haves that are not required
A comprehensive, factually correct answer with all required guardrails should score 90+.

Respond as a single JSON object.`;

    const t0 = Date.now();
    // Same router call as verifyResponse — OpenRouter (0 Base44 credits) with
    // InvokeLLM fallback only if OpenRouter is down.
    const v = await callLLMJson(svc, { prompt, schema: VERIFY_SCHEMA, orModel: 'openai/gpt-4o-mini', b44Model: 'gpt_5_mini' });
    const asArray = (x) => (Array.isArray(x) ? x : []);
    const claims = asArray(v.claims);
    const corrections = [...asArray(v.corrections)];
    const flags: string[] = [];
    let trust_score = num(v.trust_score);

    // === ENFORCED HR POLICY GUARDRAILS (mirrors verifyResponse) ===
    // Hard rules run AFTER the LLM evaluation. They adjust the trust score and
    // corrections array directly — they override, not suggest. These close the 7
    // recurring tribunal escalation gaps (benchmark 58 → 91) by catching what the
    // LLM verifier misses: missing PII warnings, missing HR contacts, missing
    // disclaimers, fabricated citations, absolute claims, and adversarial tone.
    const isHR = /employee|employer|vacation|pto|paid time off|benefits|\bhr\b|human resources|workplace|labor|employment|salary|compensation|handbook/i.test(text);
    const isLegal = /law|legal|statute|regulation|code section|federal|state law|court|ruling|compliance/i.test(text);

    // 1. PII WARNING
    if (isHR && !/pii|confidential|personal information|sensitive data/i.test(text)) {
      corrections.push('⚠️ Before sharing workplace documents with any AI system, ensure they do not contain PII or confidential information.');
      flags.push('missing_pii_warning');
      trust_score -= 10;
    }

    // 2. HR CONTACT PLACEHOLDER
    if (isHR && !/contact.*hr|hr department|people ops|your manager|human resources/i.test(text)) {
      corrections.push('For questions specific to your situation, contact: [HR Department / People Ops / your manager].');
      flags.push('missing_hr_contact');
      trust_score -= 10;
    }

    // 3. EMPLOYMENT LAW DISCLAIMER
    if (isHR && !/varies by jurisdiction|not legal advice|consult.*attorney|consult.*hr|check your.*handbook|policies vary|consult your hr department|employment attorney/i.test(text)) {
      corrections.push('Employment law varies by jurisdiction. Consult your HR department or an employment attorney for advice specific to your situation.');
      flags.push('missing_disclaimer');
      trust_score -= 10;
    }

    // (companion) LEGAL DISCLAIMER for non-HR legal text
    if (isLegal && !isHR && !/not legal advice|consult.*attorney|consult.*lawyer|varies by jurisdiction/i.test(text)) {
      corrections.push('This is not legal advice. Consult a qualified attorney.');
      flags.push('missing_legal_disclaimer');
      trust_score -= 10;
    }

    // 4. HALLUCINATED CITATION DETECTION
    // "Section X.X" / "Article X" / "Subsection X" without a named source document.
    const fabricatedCitations = text.match(/(?:Section|Article|Subsection)\s+\d+[.\d]*(?::\s*\w+(?:\s+\w+)*)?/gi) || [];
    const hasNamedSource = /(?:according to|as stated in|per|pursuant to)\s+(?:the\s+)?(?:Employee\s+(?:Handbook|Manual)|Company\s+Policy|Employment\s+Agreement|FLSA|Fair Labor Standards Act|29\s*U\.S\.C|C\.F\.R)/i.test(text);
    if (fabricatedCitations.length > 0 && !hasNamedSource) {
      if (!flags.includes('hallucinated_citation')) flags.push('hallucinated_citation');
      fabricatedCitations.forEach((citation) => {
        if (!corrections.some((c) => c.includes(citation))) {
          corrections.push(`Hallucinated citation: "${citation}" — no source document named. Provide the full document name or remove the citation.`);
        }
      });
      trust_score -= 15 * fabricatedCitations.length;
    }

    // 5. ABSOLUTE CLAIM DETECTION
    if (/\b(?:all companies|all employers|every employer|required by federal law|mandated by law|standard across all|all states)\b/i.test(text) && !/not all|not every|generally|typically|usually|may vary/i.test(text)) {
      if (!flags.includes('absolute_claim')) flags.push('absolute_claim');
      corrections.push('Absolute claim detected: this statement uses an unhedged universal ("all companies", "required by federal law", etc.). Employment terms vary widely — hedge with "typically" or "many employers".');
      trust_score -= 10;
    }

    // ADVERSARIAL TONE DETECTION
    if (/\b(?:unfair|discrimination|they don't want you to know|cover[- ]up|exploit)\b/i.test(text)) {
      if (!flags.includes('adversarial_tone')) flags.push('adversarial_tone');
      trust_score -= 5;
    }

    trust_score = Math.max(0, Math.min(100, Math.round(trust_score)));
    const verdict = trust_score >= 75 ? 'verified' : trust_score >= 50 ? 'contested' : 'rejected';
    const latency_ms = Date.now() - t0;

    // Persist: log every verification to the Inquiry entity.
    // customer_id: these records are created via the request client from an
    // x-api-key call with no Base44 session, so created_by_id is not the
    // caller — customer_id is the only owner attribution these lineages get,
    // and gateApi's side-effect gate reads it.
    const inquiry = await base44.entities.Inquiry.create({
      prompt: text.slice(0, 2000), domain: 'verification', stakes_level: 'medium', status: 'answered',
      customer_id: apiKey.user_id,
      description: `Webhook verification · verdict=${verdict} · trust=${trust_score} · ${latency_ms}ms`,
    });
    const claimsOut = claims.map((c) => ({ claim: c.claim, supported: !!c.supported, notes: c.notes || '' }));
    const av = await base44.entities.AnswerVersion.create({
      inquiry_id: inquiry.id, version: 1, answer_text: text.slice(0, 4000),
      cognitive_state: { source: 'webhook', verdict, latency_ms, claim_count: claims.length, correction_count: corrections.length, flags },
      metrics: { support_ratio: claims.length ? claimsOut.filter((c) => c.supported).length / claims.length : 0 },
      trust_score, stakes_level: 'medium',
    });
    const warrant = await base44.entities.Warrant.create({
      answer_version_id: av.id,
      premises: claims.map((c) => c.claim).slice(0, 20),
      conclusion: (v.summary || text.slice(0, 500)),
      confidence_score: trust_score / 100,
      validity_status: verdict === 'verified' ? 'valid' : verdict === 'contested' ? 'weak' : 'invalid',
      sources: [],
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      description: `Webhook verification · ${verdict} · ${claims.length} claims · ${latency_ms}ms`,
    });
    await base44.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id }).catch(() => {});

    // Metered here: the tribunal run is the billable work (same unit cost as
    // verifyResponse). A delivery failure below still returns the verification.
    await recordUsage(svc, apiKey, 'verifyResponse', CREDIT_COSTS.verifyResponse || 2, { inquiry_id: inquiry.id });

    const verification_id = String(body.verification_id || '').trim() || `vrf_${crypto.randomUUID()}`;
    const verification = { verification_id, trust_score, verdict, flags, timestamp: new Date().toISOString() };

    // Deliver via the shared SSRF-guarded POST — the URL is re-validated at
    // delivery time (defense in depth vs DNS changes between check and use) and
    // redirects are followed manually with every hop re-checked. A blocked hop
    // or network error is reported honestly: the verification still ran (and is
    // returned) but the status is never claimed as webhook_sent.
    const sent = await guardedPost(
      webhookUrl,
      { 'Content-Type': 'application/json', 'x-aether-event': 'verification.complete' },
      JSON.stringify({ data: verification }),
    ).catch((e) => ({ ok: false, error: e?.message || 'network error' }));
    if (!sent.ok) {
      return Response.json({ status: 'webhook_failed', webhook_error: sent.error, verification }, { status: 502 });
    }

    return Response.json({ status: 'webhook_sent', webhook_status: sent.status, verification });
  } catch (error) {
    console.error('webhookVerify error', error);
    return Response.json({ error: error.message || 'verification failed' }, { status: 500 });
  }
}
