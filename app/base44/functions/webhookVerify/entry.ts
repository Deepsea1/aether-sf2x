import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { callLLMJson } from '../../shared/llmRouter.js';
import { validateWebhookUrl, guardedPost } from '../../shared/webhooks.js';
import { PIPELINE_VERSION, textReuseKey, lookupVerdict, recordHit } from '../../shared/verdictReuse.js';
import { buildWarrantV2Payload, signWarrantV2, sha256Hex, buildPublicWarrantPayload, signPublicWarrant } from '../../shared/canonicalSign.js';
import { getActiveMode } from '../../shared/serviceMode.js';
import { normalizeClaims, premisesFrom } from '../../shared/claimShape.js';

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
// BYOK, grounding docs, and the red-team certification pass — none are part of
// the documented webhook contract, and omitting the red-team call keeps spend
// at or below /verifyResponse. The exact-hash verdict cache IS adopted, but
// read-only: a hit reuses verifyResponse's non-BYOK entry (same prompt, model,
// and pipeline version) and still fires a fresh webhook delivery; this endpoint
// never writes the cache because its payloads omit the red-team certification
// fields verifyResponse's cached responses carry.

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

    // === SERVICE-MODE STAMP (§9.2) — read once per request, never fatal ===
    // getActiveMode itself degrades to { mode: 'normal', mode_read_error: true }
    // on a read failure; the try/catch only guards an unexpected module throw
    // (same wrapped-never-fatal idiom as the v2 signing block below). The stamp
    // rides every HTTP response (the webhook delivery body is unchanged —
    // additive fields there would alter the documented webhook contract) and
    // warrants record the mode at issuance, so degradation is surfaced, never
    // hidden.
    let serviceMode = { mode: 'normal' };
    try { serviceMode = await getActiveMode(svc); } catch (e) { serviceMode = { mode: 'normal', mode_read_error: true }; }
    const modeStamp = serviceMode.mode_read_error ? { service_mode: serviceMode.mode, mode_read_error: true } : { service_mode: serviceMode.mode };

    // === CACHE (read-only): exact-hash reuse of a prior tribunal verdict ===
    // Shares verifyResponse's non-BYOK reuse entries — identical prompt, model,
    // and pipeline version, so the verdict is the one this endpoint would have
    // produced. The caller asked for a delivery, not a lookup, so the webhook
    // still fires on a hit: a cached verification with a fresh delivery.
    // Delivery-only hits bill 0 tribunal cost — no LLM ran, so recordUsage is
    // skipped (it no-ops on zero credits by design) and no lineage is created.
    try {
      const reuseKey = await textReuseKey({ text_sha256: await sha256Hex(text), domain, model: 'openai/gpt-4o-mini', pipeline_version: PIPELINE_VERSION });
      const hit = await lookupVerdict(svc, reuseKey);
      if (hit && hit.payload && Number.isFinite(Number(hit.payload.trust_score)) && typeof hit.payload.verdict === 'string') {
        await recordHit(svc, hit);
        const verification_id = String(body.verification_id || '').trim() || `vrf_${crypto.randomUUID()}`;
        const verification = { verification_id, trust_score: hit.payload.trust_score, verdict: hit.payload.verdict, flags: Array.isArray(hit.payload.flags) ? hit.payload.flags : [], timestamp: new Date().toISOString() };
        const sent = await guardedPost(
          webhookUrl,
          { 'Content-Type': 'application/json', 'x-aether-event': 'verification.complete' },
          JSON.stringify({ data: verification }),
        ).catch((e) => ({ ok: false, error: e?.message || 'network error' }));
        if (!sent.ok) {
          return Response.json({ status: 'webhook_failed', webhook_error: sent.error, verification, cached: true, ...modeStamp }, { status: 502 });
        }
        return Response.json({ status: 'webhook_sent', webhook_status: sent.status, verification, cached: true, ...modeStamp });
      }
    } catch (e) { /* cache miss is non-fatal */ }

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
    // Coerce model output at the boundary — see claimShape.js (a non-string
    // claim reaching Warrant.premises is a 500, not a bad warrant).
    const claims = normalizeClaims(v.claims);
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
    // Written via the service-role client so the write survives strict entity
    // RLS — the sessionless request client only worked while create was forced
    // open (commit 2d7dccd), and these calls carry no Base44 session either way.
    // customer_id: these records are created service-role from an x-api-key
    // call with no Base44 session, so created_by_id is not the caller —
    // customer_id is the only owner attribution these lineages get, and
    // gateApi's side-effect gate reads it.
    const inquiry = await svc.entities.Inquiry.create({
      prompt: text.slice(0, 2000), domain: 'verification', stakes_level: 'medium', status: 'answered',
      customer_id: apiKey.user_id,
      description: `Webhook verification · verdict=${verdict} · trust=${trust_score} · ${latency_ms}ms`,
    });
    const claimsOut = claims.map((c) => ({ claim: c.claim, supported: !!c.supported, notes: c.notes || '' }));
    const av = await svc.entities.AnswerVersion.create({
      inquiry_id: inquiry.id, version: 1, answer_text: text.slice(0, 4000),
      cognitive_state: { source: 'webhook', verdict, latency_ms, claim_count: claims.length, correction_count: corrections.length, flags },
      metrics: { support_ratio: claims.length ? claimsOut.filter((c) => c.supported).length / claims.length : 0 },
      trust_score, stakes_level: 'medium',
    });
    const premises = premisesFrom(claims);
    const conclusion = (v.summary || text.slice(0, 500));
    const warrant = await svc.entities.Warrant.create({
      answer_version_id: av.id,
      premises,
      conclusion,
      confidence_score: trust_score / 100,
      validity_status: verdict === 'verified' ? 'valid' : verdict === 'contested' ? 'weak' : 'invalid',
      sources: [],
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      service_mode_at_issuance: serviceMode.mode,
      description: `Webhook verification · ${verdict} · ${claims.length} claims · ${latency_ms}ms`,
    });
    await svc.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id }).catch(() => {});
    // Dual-sign (§9.3): additive RFC 8785 canonical v2 signature — these
    // API-path warrants previously carried no signature at all. answer_text_sha256
    // hashes the answer text AS PERSISTED on the AnswerVersion row (the
    // .slice(0, 4000) above); conclusion/premises/sources mirror the values
    // persisted on the warrant. Applied via .update, wrapped so a signing
    // failure never fails the request (the warrant just stays v2-unsigned,
    // like a pre-rollout one).
    //
    // PUBLIC SEAL: the v2 payload above binds CONTENT the warrant registry
    // deliberately never publishes, so an outsider cannot rebuild its signed
    // bytes and cannot check it. The additional public seal signs a payload of
    // published material only — ids, hashes of that same persisted content, and
    // the row's created_date — so it IS checkable offline against
    // warrantRegistry?op=keys. Built in its own guard inside this block: a
    // public-seal failure must not cost the v2 seal that is otherwise ready to
    // store, and neither may fail the verification.
    try {
      const answerTextSha256 = await sha256Hex(text.slice(0, 4000));
      const v2 = await signWarrantV2(buildWarrantV2Payload({
        answer_version_id: av.id,
        answer_text_sha256: answerTextSha256,
        conclusion,
        premises,
        sources: [],
      }));
      let pub = null;
      let sealed = null;
      try {
        // created_date is signed and must be the value the registry publishes.
        // create() carries it; re-read if it ever does not, rather than let
        // every warrant fail to seal silently.
        const row = warrant.created_date ? warrant : (await svc.entities.Warrant.get(warrant.id).catch(() => null)) || warrant;
        pub = await buildPublicWarrantPayload({
          warrant_id: warrant.id,
          answer_version_id: av.id,
          answer_text_sha256: answerTextSha256,
          conclusion,
          premises,
          sources: [],
          created_date: row.created_date,
        });
        sealed = await signPublicWarrant(pub);
      } catch (e) { console.error('warrant public seal failed', e?.message || e); }
      const patch = {
        ...(v2 ? { schema_version: v2.schema_version, payload_hash_v2: v2.payload_hash_v2, signed_hash_v2: v2.signed_hash_v2, key_id_v2: v2.key_id, answer_text_sha256: answerTextSha256 } : {}),
        // answer_text_sha256 rides with the seal too, so a public seal can never
        // reference a hash the row does not publish.
        ...(sealed ? {
          answer_text_sha256: answerTextSha256,
          conclusion_sha256: pub.conclusion_sha256, premises_sha256: pub.premises_sha256, sources_sha256: pub.sources_sha256,
          public_payload_hash: sealed.public_payload_hash, public_seal: sealed.public_seal, public_seal_key_id: sealed.public_seal_key_id,
        } : {}),
      };
      if (Object.keys(patch).length) await svc.entities.Warrant.update(warrant.id, patch);
    } catch (e) { console.error('warrant v2 signing failed', e?.message || e); }

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
      return Response.json({ status: 'webhook_failed', webhook_error: sent.error, verification, ...modeStamp }, { status: 502 });
    }

    return Response.json({ status: 'webhook_sent', webhook_status: sent.status, verification, ...modeStamp });
  } catch (error) {
    console.error('webhookVerify error', error);
    return Response.json({ error: error.message || 'verification failed' }, { status: 500 });
  }
}
