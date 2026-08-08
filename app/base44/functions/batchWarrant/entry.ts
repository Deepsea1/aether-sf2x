import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { resolveApiKey } from '../../shared/apiAuth.js';
import { attestAnswer } from '../../shared/attest.js';

// Batch Warrant API — attest up to 25 answers in one call. Each item is attested
// independently; per-item successes and failures are returned in order.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (!answers.length) return Response.json({ error: 'answers[] is required' }, { status: 400 });
    if (answers.length > 25) return Response.json({ error: 'Max 25 answers per batch' }, { status: 413 });

    const origin = new URL(req.url).origin;
    const signatureKeys = { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
    const results = [];
    for (const a of answers) {
      try {
        const r = await attestAnswer(svc, {
          answerText: a.answer_text,
          premises: a.premises,
          sources: a.sources,
          domain: a.domain,
          stakes: a.stakes,
          modelLabel: a.model_label,
          apiKey, origin, signatureKeys,
        });
        results.push({ ok: true, ...r });
      } catch (e) {
        results.push({ ok: false, error: e.message });
      }
    }
    return Response.json({ count: results.length, succeeded: results.filter((r) => r.ok).length, results });
  } catch (error) {
    console.error('batchWarrant error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}