// Resolves an inbound API key (x-api-key header) against the ApiKey entity, and
// meters per-key usage against the customer's plan quota so the inbound trust
// endpoints (warrantApi, gateApi) are billable, rate-limited middleware rather
// than a free-for-all. Used by public/inbound endpoints where the caller is not
// a logged-in app user but presents a provisioned sk_sf2x_... key.

// Monthly credit quota per plan tier. Maps the Subscription.plan value to a
// ceiling; an unmetered/trial key gets a small free allowance so the wrap demo
// pattern can be exercised before a customer upgrades.
// Monthly credit quota per plan tier. Calibrated against the asymmetric
// routing cost (~$0.035/credit at full tribunal): every tier is profitable
// at these allowances. BYOK carries a generous fair-use ceiling because the
// customer pays their own provider LLM cost. Scale is high but bounded.
export const PLAN_QUOTAS = {
  starter: 250,
  pro: 1000,
  enterprise: 15000,
  byok: 200000,        // fair-use; BYOK LLM cost is on the customer's provider key
  scale: 150000,
  // legacy fallbacks (older plan names still on active subscriptions)
  premium: 1000,
  'api-access': 10000,
  'api-access-pro': 50000,
  free: 100,           // free API keys only — the public console uses ip_hash daily limiting
};

// Credits consumed per endpoint call. Gate checks are free (zero-LLM safety
// check) so every plan gets unlimited gate calls; only warrant + inquire meter.
export const CREDIT_COSTS = {
  warrantApi: 5,
  // Per ITEM in the batch — batchWarrant runs the identical attestAnswer work as
  // warrantApi, up to 25x per call, so it bills at the same unit price.
  batchWarrant: 5,
  gateApi: 0,
  inquire: 10,
  verifyResponse: 2,
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function resolveApiKey(svc, req, opts = {}) {
  const key = (req.headers.get('x-api-key') || req.headers.get('X-Api-Key') || '').trim();
  if (key) {
    const found = await svc.entities.ApiKey.filter({ key, active: true });
    if (!found || !found.length) {
      return { ok: false, response: Response.json({ error: 'Invalid or inactive API key' }, { status: 403 }) };
    }
    return { ok: true, apiKey: found[0] };
  }
  // No API key — allow a signed-in app user (e.g. an MCP OAuth session, or the
  // app's own logged-in owner) to act as the caller, metered against their own
  // subscription. Only enabled when the caller passes the plain (non-service-role)
  // client via opts.base44, so existing key-only endpoints keep their behavior.
  if (opts.base44) {
    try {
      const user = await opts.base44.auth.me();
      if (user && user.id) {
        return { ok: true, apiKey: { id: 'session:' + user.id, user_id: user.id, label: user.email || 'session', active: true } };
      }
    } catch { /* not signed in */ }
  }
  return { ok: false, response: Response.json({ error: 'Missing x-api-key header' }, { status: 401 }) };
}

// Resolve the customer's active plan + how much of this month's quota is spent.
// Pass `endpoint` to let zero-cost endpoints (gateApi) bypass the quota entirely.
export async function checkQuota(svc, apiKey, endpoint) {
  const userId = apiKey.user_id;
  let plan = 'free';
  try {
    const subs = await svc.entities.Subscription.filter({ user_id: userId });
    const now = Date.now();
    const active = (subs || []).find((s) =>
      (s.status === 'active' || s.status === 'trialing') &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() >= now)
    );
    if (active && active.plan) plan = active.plan;
  } catch {}
  const month = currentMonth();
  // Free endpoints (e.g. gateApi) are never quota-gated.
  if (endpoint && (CREDIT_COSTS[endpoint] ?? 1) === 0) {
    return { allowed: true, remaining: Infinity, limit: Infinity, used: 0, plan, month };
  }
  const limit = PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;
  let used = 0;
  try {
    const rows = await svc.entities.ApiUsage.filter({ user_id: userId, month });
    used = (rows || []).reduce((s, r) => s + (Number(r.credits) || 0), 0);
  } catch {}
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, remaining, limit, used, plan, month };
}

// Record a successful metered call. Called AFTER the endpoint work succeeds so
// failed calls are not charged. Zero-credit calls (gateApi) are not recorded.
export async function recordUsage(svc, apiKey, endpoint, credits, metadata = {}) {
  if (!credits || credits <= 0) return;
  try {
    await svc.entities.ApiUsage.create({
      api_key_id: apiKey.id, user_id: apiKey.user_id,
      endpoint, credits: Number(credits) || 0, month: currentMonth(), metadata,
    });
  } catch (e) { console.error('recordUsage failed', e?.message || e); }
}