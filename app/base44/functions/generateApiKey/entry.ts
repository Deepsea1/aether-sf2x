import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    const key = 'sk_sf2x_' + Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Optional opt-in expiry. When set, the Key Expiry Guard workflow warns the
    // owner 7 days before and auto-revokes on expiry. Omit for a non-expiring key.
    const expiresInDays = Number(body.expires_in_days);
    const expiry_date = Number.isFinite(expiresInDays) && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString()
      : null;

    const rec = await base44.asServiceRole.entities.ApiKey.create({
      key,
      user_id: user.id,
      label: user.email || 'default',
      active: true,
      expiry_date,
    });
    return Response.json({ id: rec.id, key, expiry_date });
  } catch (error) {
    console.error('generateApiKey error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}