/**
 * POST /alerts/dispatch — turn a verification into a Slack or Teams channel alert.
 *
 * The decision and formatting are pure and live in ./alerts.js; this file is only the
 * HTTP edge: auth, input caps, rate limiting, then delegate.
 *
 * Auth reuses the SAME static bearer as the legacy MCP endpoint — no new credential
 * and no new auth mechanism is introduced here. It fails closed exactly as that path
 * does (see src/auth.js).
 *
 * Request body:
 *   {
 *     "verification":  { … },            // verifyResponse | webhook event | worker record
 *     "webhook_url":   "https://hooks.slack.com/services/…",
 *     "channel":       "slack" | "teams",  // optional; inferred from webhook_url
 *     "rules":         { "minTrustScore": 70, … },  // optional; see DEFAULT_RULES
 *     "force":         false,              // optional; format even if rules stay silent
 *     "dry_run":       false               // optional; build + return, never deliver
 *   }
 *
 * Response 200:
 *   { alerted, reasons[], channel, policy, delivery: {ok,status} | null, payload? }
 *
 * `alerted: false` is a SUCCESS, not an error: the rules were evaluated and the
 * verification did not warrant paging a team. The reasons array says why either way.
 */

import { validStaticBearer, staticIdentity } from './auth.js';
import { checkRateLimit } from './ratelimit.js';
import { buildAlert, dispatchAlert, inferChannel, CHANNEL_BUILDERS } from './alerts.js';

/** Cap on the inbound verification blob — an alert payload is small by nature. */
const MAX_BODY_CHARS = 100000;

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handleAlertsDispatch(req, env) {
  // 1. Auth — same static bearer as the legacy MCP root, fail-closed.
  if (!(await validStaticBearer(req, env))) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }

  // 2. Rate limit before any outbound request (denial-of-wallet / abuse guard).
  const identity = await staticIdentity(req);
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const rl = await checkRateLimit(env, identity, ip);
  if (rl.limited) {
    return Response.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } },
    );
  }

  // 3. Parse with a size cap.
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return bad(`request body exceeds ${MAX_BODY_CHARS} characters`, 413);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad('request body must be valid JSON');
  }
  if (!body || typeof body !== 'object') return bad('request body must be a JSON object');

  const verification = body.verification ?? body;
  const webhookUrl = typeof body.webhook_url === 'string' ? body.webhook_url.trim() : '';
  const dryRun = body.dry_run === true;

  if (!dryRun && !webhookUrl) {
    return bad('webhook_url is required (or set dry_run: true to preview the card)');
  }

  // 4. Channel — explicit wins; otherwise infer from the URL. Never guess blindly.
  const channel = typeof body.channel === 'string' && body.channel.trim()
    ? body.channel.trim().toLowerCase()
    : inferChannel(webhookUrl);

  if (!channel) {
    return bad(
      `could not infer channel from webhook_url — pass "channel" explicitly (one of: ${Object.keys(CHANNEL_BUILDERS).join(', ')})`,
    );
  }
  if (!CHANNEL_BUILDERS[channel]) {
    return bad(`unknown channel "${channel}" — expected one of: ${Object.keys(CHANNEL_BUILDERS).join(', ')}`);
  }

  // 5. The pure decision.
  let result;
  try {
    result = buildAlert(verification, { channel, rules: body.rules, force: body.force === true });
  } catch (err) {
    return bad(String(err?.message || err));
  }

  // Rules stayed silent → report the decision, send nothing.
  if (!result.payload) {
    return Response.json({
      alerted: false,
      reasons: result.reasons,
      channel,
      policy: result.policy,
      delivery: null,
    });
  }

  // 6. Preview mode returns the exact card without delivering it.
  if (dryRun) {
    return Response.json({
      alerted: false,
      dry_run: true,
      reasons: result.reasons,
      channel,
      policy: result.policy,
      delivery: null,
      payload: result.payload,
    });
  }

  // 7. Deliver. The URL is customer-supplied, so dispatchAlert re-checks it against
  //    the SSRF guard before the request; a delivery failure is reported, not thrown.
  const delivery = await dispatchAlert(webhookUrl, result.payload);
  return Response.json(
    {
      alerted: delivery.ok,
      reasons: result.reasons,
      channel,
      policy: result.policy,
      delivery,
    },
    { status: delivery.ok ? 200 : 502 },
  );
}
