// Shared webhook delivery — fires configured WebhookConfig endpoints when the
// trust layer takes a notable action (a gate suppresses/escalates, drift spikes,
// a review opens, a verification rejects). Supports Slack incoming webhooks,
// PagerDuty Events API v2, and raw JSON custom endpoints. Called from gateApi
// (and any other producer) after the decision is made; failures never block the
// originating request. Also exports the SSRF guard (validateWebhookUrl +
// guardedPost) for endpoints that POST to caller-supplied URLs (webhookVerify).

const EVENTS = ['gate.suppress', 'gate.escalate', 'drift.alert', 'review.opened', 'verify.rejected'];

function formatSlack(event, p) {
  const emoji = /suppress|reject|alert|drift/i.test(event) ? '🚨' : /escalate|review/i.test(event) ? '⚠️' : '✅';
  const lines = [`${emoji} *Aether ${event}*`];
  if (p.summary) lines.push(p.summary);
  if (p.trust_score != null) lines.push(`Trust: ${p.trust_score}/100`);
  if (p.reason) lines.push(`_${p.reason}_`);
  if (p.url) lines.push(`<${p.url}|View in Aether>`);
  return lines.join('\n');
}

// SSRF guard — reject webhook URLs that target internal/private infrastructure or
// cloud-metadata endpoints before any outbound request is made. Validated at
// delivery time (defense in depth) so a stored WebhookConfig pointing at an
// internal address can never be fetched by the service role. Fails closed: an
// unresolvable hostname or a hostname that resolves to a private IP is blocked.
const METADATA_HOSTS = new Set([
  '169.254.169.254', 'metadata.google.internal', 'metadata',
  'metadata.aws.internal', 'fd00:ec2::254', '[fd00:ec2::254]',
]);

function isPrivateIPv4(ip) {
  const p = ip.split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 127) return true;                       // loopback
  if (a === 10) return true;                        // 10/8 private
  if (a === 0) return true;                         // 0.0.0.0/8
  if (a === 169 && b === 254) return true;           // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12 private
  if (a === 192 && b === 168) return true;           // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === '::1') return true;                       // loopback
  const first = (v.replace(/^:/, '').split(':')[0]) || '';
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // unique-local fc00::/7
  if (first.startsWith('fe8') || first.startsWith('fe9') || first.startsWith('fea') || first.startsWith('feb')) return true; // link-local fe80::/10
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

async function isBlockedHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIPv4(h);
  if (h.includes(':')) return isPrivateIPv6(h);
  try {
    const A = await Deno.resolveDns(h, 'A').catch(() => []);
    const AAAA = await Deno.resolveDns(h, 'AAAA').catch(() => []);
    const ips = [...A, ...AAAA];
    if (!ips.length) return true; // fail closed: unresolvable
    return ips.some((ip) => (/^\d+\.\d+\.\d+\.\d+$/.test(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip)));
  } catch {
    return true; // fail closed
  }
}

export async function validateWebhookUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: 'invalid URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'non-http(s) protocol' };
  if (u.username || u.password) return { ok: false, error: 'credentials embedded in URL' };
  if (await isBlockedHost(u.hostname)) return { ok: false, error: 'blocked host (private/internal/metadata)' };
  return { ok: true };
}

// guardedPost — the SSRF-guarded outbound POST every webhook-style delivery goes
// through. Validates the target before any request is made, then never lets
// fetch() auto-follow redirects — an attacker could 302 to an internal/metadata
// endpoint that bypassed validateWebhookUrl. Redirects are followed manually,
// re-validating every Location target against the same private-host blocklist,
// capped at 5 hops. Returns { ok: true, status } with the final response status,
// or { ok: false, error, stage } where stage is 'validate' (initial URL
// rejected), 'redirect' (a redirect target rejected), or 'redirect_cap' (too
// many redirects). Network errors propagate to the caller.
export async function guardedPost(url, headers, body) {
  const check = await validateWebhookUrl(url);
  if (!check.ok) return { ok: false, error: check.error, stage: 'validate' };
  let target = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(target, { method: 'POST', headers, body, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), target).href;
      const rc = await validateWebhookUrl(next);
      if (!rc.ok) return { ok: false, error: rc.error, stage: 'redirect' };
      target = next;
      continue;
    }
    return { ok: true, status: res.status };
  }
  return { ok: false, error: 'too many redirects', stage: 'redirect_cap' };
}

async function deliver(h, event, payload) {
  let body;
  const headers = { 'Content-Type': 'application/json', 'X-Aether-Event': event };
  if (h.secret) headers['X-Aether-Signature'] = h.secret;
  if (h.kind === 'slack' || /hooks\.slack\.com/.test(h.url)) {
    body = JSON.stringify({ text: formatSlack(event, payload) });
  } else if (h.kind === 'pagerduty') {
    body = JSON.stringify({
      event_action: 'trigger',
      routing_key: (h.url.split('/').pop() || '').trim() || h.url,
      payload: {
        summary: `Aether ${event}: ${payload.summary || ''}`,
        severity: /suppress|reject|drift/i.test(event) ? 'critical' : 'error',
        source: 'aether',
        custom_details: payload,
      },
    });
  } else {
    body = JSON.stringify({ event, payload, sent_at: new Date().toISOString() });
  }
  const sent = await guardedPost(h.url, headers, body);
  if (!sent.ok) {
    if (sent.stage === 'validate') console.warn(`webhook delivery skipped (${h.label || h.id}): ${sent.error}`);
    else if (sent.stage === 'redirect') console.warn(`webhook redirect blocked (${h.label || h.id}): ${sent.error}`);
    else console.warn(`webhook delivery aborted (${h.label || h.id}): ${sent.error}`);
  }
}

export async function fireWebhooks(svc, event, payload, ownerId) {
  try {
    // Tenant scoping: when an event is triggered on behalf of a specific customer
    // (e.g. their API key drove the gate decision), only deliver to WebhookConfig
    // records owned by that customer — so one tenant's endpoints can never receive
    // another tenant's AI answer text, trust scores, or gate decisions. System
    // triggers (no ownerId) still broadcast to all active webhooks.
    const query = ownerId ? { active: true, created_by_id: ownerId } : { active: true };
    const hooks = await svc.entities.WebhookConfig.filter(query);
    const matching = (hooks || []).filter((h) => !h.events || !h.events.length || h.events.includes(event));
    await Promise.allSettled(matching.map((h) => deliver(h, event, payload)));
  } catch (e) {
    console.error('fireWebhooks failed', e?.message || e);
  }
}

export { EVENTS };