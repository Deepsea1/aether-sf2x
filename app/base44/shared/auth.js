// Shared admin auth guard for backend functions invoked by workflows or admins.
// Workflow runs execute under the platform service principal (role 'admin'), so
// this accepts both human admins and automated workflow calls — no shared secret
// needs to be embedded in workflow definitions.
export async function requireAdmin(base44) {
  let user = null;
  try { user = await base44.auth.me(); } catch {}
  if (!user) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role !== 'admin') return { ok: false, response: Response.json({ error: 'Admin only' }, { status: 403 }) };
  return { ok: true, user };
}