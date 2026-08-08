import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifySignature, signatureScheme } from '../../shared/sf2xCore.js';

// Public, read-only Warrant Registry — an append-only transparency log. Anyone
// can independently verify a warrant's cryptographic signature and inspect the
// chain. The chain root hash is tamper-evident: any insertion, removal, or
// modification of a warrant changes it. No auth required (transparency).

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The signing content varies by attestation flow (inquire vs warrantApi). Try all
// known variants so verification is robust regardless of which flow produced it.
function signingVariants(w, av) {
  const p = (w.premises || []).join(';;');
  const s = (w.sources || []).join(';;');
  const concl = w.conclusion || '';
  const ans = av.answer_text || '';
  return [
    [av.id, concl, p].join('|'),
    [av.id, ans, p, s].join('|'),
    [av.id, concl, p, s].join('|'),
    [av.id, ans, '', s].join('|'),   // warrantApi/MCP path: premises signed as empty
  ];
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 100, 500);

    const warrants = await svc.entities.Warrant.list('-created_date', limit);
    const ascending = [...warrants].reverse();
    const root = await sha256hex(ascending.map((w) => w.signed_hash || w.id).join('|'));

    let verified = null;
    // Lookup accepts warrant_id, verification_id, or lineage_id (answer_version_id).
    let w = null;
    if (body.warrant_id) {
      w = await svc.entities.Warrant.get(body.warrant_id).catch(() => null);
    }
    if (!w) {
      const lid = body.verification_id || body.lineage_id;
      if (lid) {
        w = await svc.entities.Warrant.get(lid).catch(() => null);
        if (!w) {
          const found = await svc.entities.Warrant.filter({ answer_version_id: lid }, '-created_date', 1).catch(() => []);
          w = (found && found[0]) || null;
        }
      }
    }
    if (w) {
      const av = await svc.entities.AnswerVersion.get(w.answer_version_id).catch(() => null);
      let inquiry = null;
      if (av?.inquiry_id) inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);
      const stored = w.signed_hash || '';
      let valid = false;
      const scheme = signatureScheme(stored);
      if (av && stored) {
        const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
        for (const candidate of signingVariants(w, av)) {
          if (await verifySignature(candidate, stored, signatureKeys)) { valid = true; break; }
        }
      }
      verified = {
        warrant_id: w.id,
        answer_version_id: w.answer_version_id,
        created_date: w.created_date,
        validity_status: w.validity_status,
        confidence_score: w.confidence_score,
        expiry_date: w.expiry_date || null,
        premises: w.premises || [],
        conclusion: w.conclusion || '',
        sources: w.sources || [],
        premises_count: (w.premises || []).length,
        sources_count: (w.sources || []).length,
        signed_hash: stored,
        signature_valid: valid,
        signature_scheme: scheme,
        signature_public_key: scheme === 'Ed25519' ? secrets.get('ED25519_PUBLIC_KEY') : null,
        source_snapshots: w.source_snapshots || [],
        corroboration: w.corroboration || null,
        authoritative_grounding: w.authoritative_grounding || null,
        grounding_notes: w.grounding_notes || '',
        lineage: av ? {
          answer_version_id: av.id,
          inquiry_id: av.inquiry_id,
          version: av.version,
          trust_score: av.trust_score,
          stakes_level: av.stakes_level,
          answer_excerpt: (av.answer_text || '').slice(0, 240),
        } : null,
        inquiry: inquiry ? { prompt: (inquiry.prompt || '').slice(0, 240), domain: inquiry.domain, stakes_level: inquiry.stakes_level } : null,
        verify_url: `/verify/${w.answer_version_id}`,
      };
    }

    const chain = warrants.map((w) => ({
      warrant_id: w.id,
      created_date: w.created_date,
      answer_version_id: w.answer_version_id,
      validity_status: w.validity_status,
      confidence_score: w.confidence_score,
      sources_count: (w.sources || []).length,
      premises_count: (w.premises || []).length,
      signed_hash: w.signed_hash,
      evidence_preserved: (w.source_snapshots || []).length,
    }));

    return Response.json({
      registry: 'sf2x_warrants',
      root,
      count: chain.length,
      chain,
      verified_warrant: verified,
      note: 'Append-only transparency log. Any insertion, removal, or modification of a warrant changes the root hash. Verify any warrant signature independently via warrant_id.',
    });
  } catch (error) {
    console.error('warrantRegistry error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}