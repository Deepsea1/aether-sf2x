import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { normalizeClaims, premisesFrom } from '../../shared/claimShape.js';
import { buildWarrantV2Payload, signWarrantV2, sha256Hex, buildPublicWarrantPayload, signPublicWarrant } from '../../shared/canonicalSign.js';

// streamVerify — Server-Sent Events endpoint that streams a verification
// verdict progressively: analyzing → per-claim → verdict → done. Same fast
// single-pass tribunal as verifyResponse, but the client receives events as
// they become available so a UI can render the verdict building in real time.

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['claim', 'supported'],
      },
    },
    corrections: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['verified', 'contested', 'rejected'] },
    trust_score: { type: 'number' },
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
    const domain = String(body.domain || 'General');
    const source = String(body.source || 'stream');

    // { base44 } lets a signed-in app user (an MCP OAuth session, or the app's
    // own logged-in owner) act as the caller, metered against their own
    // subscription — the same call gateApi and warrantApi make. Without it this
    // endpoint accepted x-api-key holders ONLY, so a signed-in user could not
    // stream at all. resolveApiKey still tries the header first and only falls
    // back to the session when the option is present.
    const auth = await resolveApiKey(svc, req, { base44 });
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) return Response.json({ error: 'Monthly verification quota exceeded' }, { status: 429 });

    const prompt = `You are the Aether verification engine — a fast, impartial tribunal that checks an AI-generated text for hallucinations in real time. Act as proposer, critic, and verifier in a single pass.

TEXT TO VERIFY:
"""${text}"""

DOMAIN: ${domain}

Decompose the text into discrete factual claims, judge each as supported or unsupported, list specific corrections, render a verdict (verified/contested/rejected), and assign a calibrated trust score 0-100 (never 100; ≥90 only for reputation-staking claims). Respond as a single JSON object.`;

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ stage: 'analyzing' });
        try {
          const t0 = Date.now();
          const res = await svc.integrations.Core.InvokeLLM({ prompt, response_json_schema: VERIFY_SCHEMA, model: 'gpt_5_mini' });
          const v = (res && res.data) ? res.data : res;
          const asArray = (x) => (Array.isArray(x) ? x : []);
          // Coerce model output at the boundary — see claimShape.js.
          const claims = normalizeClaims(v.claims);
          const corrections = asArray(v.corrections);
          const trust_score = Math.max(0, Math.min(100, Math.round(num(v.trust_score))));
          const verdict = v.verdict || (trust_score >= 75 ? 'verified' : trust_score >= 50 ? 'contested' : 'rejected');
          const latency_ms = Date.now() - t0;

          send({ stage: 'claims', count: claims.length });
          for (const c of claims) send({ stage: 'claim', claim: c });

          // Persist the verification.
          // Written via the service-role client so the writes survive strict
          // entity RLS — the sessionless request client only worked while
          // create was forced open (commit 2d7dccd).
          // customer_id: these records are created service-role from an
          // x-api-key call with no Base44 session, so created_by_id is not the
          // caller — customer_id is the only owner attribution these lineages
          // get, and gateApi's side-effect gate reads it.
          const inquiry = await svc.entities.Inquiry.create({
            prompt: text.slice(0, 2000), domain: 'verification', stakes_level: 'medium', status: 'answered',
            customer_id: apiKey.user_id,
            description: `Stream verification · source=${source} · verdict=${verdict} · trust=${trust_score}`,
          });
          const av = await svc.entities.AnswerVersion.create({
            inquiry_id: inquiry.id, version: 1, answer_text: text.slice(0, 4000),
            cognitive_state: { source, verdict, latency_ms, claim_count: claims.length },
            metrics: { support_ratio: claims.length ? claims.filter((c) => c.supported).length / claims.length : 0 },
            trust_score, stakes_level: 'medium',
          });
          const premises = premisesFrom(claims);
          const conclusion = (v.summary || text.slice(0, 500));
          const warrant = await svc.entities.Warrant.create({
            answer_version_id: av.id, premises,
            conclusion, confidence_score: trust_score / 100,
            validity_status: verdict === 'verified' ? 'valid' : verdict === 'contested' ? 'weak' : 'invalid',
            sources: [], expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
            description: `Stream verification · ${verdict} · ${latency_ms}ms`,
          });
          await svc.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id }).catch(() => {});
          // Seal the warrant — mirrors verifyResponse/webhookVerify exactly.
          // This path previously stored NO signature of any kind, so its
          // warrants read as signature_scheme 'none' in the registry. Two
          // additive seals: the RFC 8785 canonical v2 signature (binds the
          // persisted content; verifiable by anyone holding that content), and
          // the public seal over ids + hashes of that same content, which the
          // registry publishes in full — so an outsider can check it offline
          // against warrantRegistry?op=keys. answer_text_sha256 hashes the
          // answer text AS PERSISTED on the AnswerVersion row (the
          // .slice(0, 4000) above); conclusion/premises/sources mirror the
          // values persisted on the warrant. The public seal is built in its
          // own guard so its failure cannot cost the v2 seal, and the whole
          // block is wrapped so no sealing failure ever breaks the stream.
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
              // created_date is signed and must be the value the registry
              // publishes. create() carries it; re-read if it ever does not,
              // rather than let every warrant fail to seal silently.
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
              ...(sealed ? {
                answer_text_sha256: answerTextSha256,
                conclusion_sha256: pub.conclusion_sha256, premises_sha256: pub.premises_sha256, sources_sha256: pub.sources_sha256,
                public_payload_hash: sealed.public_payload_hash, public_seal: sealed.public_seal, public_seal_key_id: sealed.public_seal_key_id,
              } : {}),
            };
            if (Object.keys(patch).length) await svc.entities.Warrant.update(warrant.id, patch);
          } catch (e) { console.error('warrant v2 signing failed', e?.message || e); }
          if (apiKey) await recordUsage(svc, apiKey, 'verifyResponse', CREDIT_COSTS.verifyResponse || 2, { inquiry_id: inquiry.id });

          send({ stage: 'verdict', trust_score, verdict, corrections, summary: v.summary || '', warrant_id: warrant.id, tribunal_url: `/verify/${av.id}`, latency_ms });
          send({ stage: 'done', tribunal_url: `/verify/${av.id}` });
        } catch (e) {
          send({ stage: 'error', error: e?.message || 'verification failed' });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' },
    });
  } catch (error) {
    console.error('streamVerify error', error);
    return Response.json({ error: error.message || 'stream failed' }, { status: 500 });
  }
}