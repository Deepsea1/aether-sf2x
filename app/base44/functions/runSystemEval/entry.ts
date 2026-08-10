import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { evaluateSystem } from '../../shared/systemEval.js';

// Single-system automated evaluation endpoint. Thin HTTP wrapper around the
// shared evaluateSystem core (also used by the daily sweep).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const body = await req.json().catch(() => ({}));
    if (!body.system_id) return Response.json({ error: 'system_id is required' }, { status: 400 });
    const origin = new URL(req.url).origin;
    const result = await evaluateSystem(base44.asServiceRole, {
      systemId: body.system_id,
      prompts: body.prompts,
      adminId: _auth.user?.id,
      origin,
      signatureKeys: { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') },
    });
    return Response.json(result, { status: result.error ? (result.status || 400) : 200 });
  } catch (error) {
    console.error('runSystemEval error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}