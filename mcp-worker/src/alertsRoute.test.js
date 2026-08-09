/**
 * Tests for POST /alerts/dispatch — the HTTP edge.
 *
 * Run: node --test src/alertsRoute.test.js   (from mcp-worker/)
 *
 * The pure decision is covered in alerts.test.js; what matters here is the edge:
 * it must fail closed without the bearer, must not deliver to a private address, and
 * must treat "the rules did not fire" as a success rather than an error.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleAlertsDispatch } from './alertsRoute.js';

const TOKEN = 'test-static-bearer-value';
/** No KV bindings ⇒ checkRateLimit short-circuits to not-limited (see ratelimit.js). */
const ENV = { AETHER_MCP_TOKEN: TOKEN };

const LOW_TRUST = {
  trust_score: 40,
  verdict: 'contested',
  domain: 'HR',
  claims: [{ claim: 'Section 4.1 grants 15 days.', supported: false, notes: 'No source cited.' }],
  corrections: ['Cite the specific employer.'],
  tribunal_url: '/verify/lin_1',
  lineage_id: 'lin_1',
};

const HEALTHY = { trust_score: 91, verdict: 'verified', domain: 'General' };

function reqWith(body, { token = TOKEN, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('https://worker.test/alerts/dispatch', {
    method,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('auth — fails closed', () => {
  test('401 with no Authorization header', async () => {
    const res = await handleAlertsDispatch(reqWith({ dry_run: true }, { token: null }), ENV);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('WWW-Authenticate') || '', /Bearer/);
  });

  test('401 with a wrong bearer', async () => {
    const res = await handleAlertsDispatch(reqWith({ dry_run: true }, { token: 'nope' }), ENV);
    assert.equal(res.status, 401);
  });

  test('401 when no token is configured at all (no fail-open)', async () => {
    const res = await handleAlertsDispatch(reqWith({ dry_run: true }), {});
    assert.equal(res.status, 401);
  });
});

describe('input validation', () => {
  test('400 on malformed JSON', async () => {
    const res = await handleAlertsDispatch(reqWith('{not json'), ENV);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /valid JSON/);
  });

  test('400 when webhook_url is missing and it is not a dry run', async () => {
    const res = await handleAlertsDispatch(reqWith({ verification: LOW_TRUST }), ENV);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /webhook_url is required/);
  });

  test('400 when the channel cannot be inferred and was not given', async () => {
    const res = await handleAlertsDispatch(
      reqWith({ verification: LOW_TRUST, webhook_url: 'https://example.com/hook' }),
      ENV,
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /could not infer channel/);
  });

  test('400 on an unknown explicit channel', async () => {
    const res = await handleAlertsDispatch(
      reqWith({ verification: LOW_TRUST, webhook_url: 'https://example.com/h', channel: 'fax' }),
      ENV,
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /unknown channel "fax"/);
  });

  test('413 on an oversize body', async () => {
    const res = await handleAlertsDispatch(
      reqWith({ verification: { text: 'x'.repeat(120000) }, dry_run: true }),
      ENV,
    );
    assert.equal(res.status, 413);
  });
});

describe('the decision is reported, not forced', () => {
  test('a healthy verification returns alerted:false as a 200 success', async () => {
    const res = await handleAlertsDispatch(
      reqWith({
        verification: HEALTHY,
        webhook_url: 'https://hooks.slack.com/services/A/B/C',
      }),
      ENV,
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.alerted, false);
    assert.equal(json.delivery, null, 'nothing should be delivered when no rule fires');
    assert.deepEqual(json.reasons, []);
  });

  test('the applied policy is echoed back so the caller can see the thresholds used', async () => {
    const res = await handleAlertsDispatch(
      reqWith({ verification: HEALTHY, webhook_url: 'https://hooks.slack.com/services/A/B/C' }),
      ENV,
    );
    const json = await res.json();
    assert.equal(json.policy.minTrustScore, 70);
  });
});

describe('dry_run previews the exact card without delivering', () => {
  test('returns the Slack payload and never contacts the webhook', async () => {
    const res = await handleAlertsDispatch(
      reqWith({ verification: LOW_TRUST, channel: 'slack', dry_run: true }),
      ENV,
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.dry_run, true);
    assert.equal(json.delivery, null);
    assert.ok(json.payload, 'a dry run should still return the built card');
    assert.match(JSON.stringify(json.payload), /View Cryptographic Warrant/);
  });

  test('infers the channel for a Teams URL', async () => {
    const res = await handleAlertsDispatch(
      reqWith({
        verification: LOW_TRUST,
        webhook_url: 'https://acme.webhook.office.com/webhookb2/abc',
        dry_run: true,
      }),
      ENV,
    );
    const json = await res.json();
    assert.equal(json.channel, 'teams');
    assert.equal(json.payload['@type'], 'MessageCard');
  });
});

describe('SSRF is enforced at the edge too', () => {
  const privateTargets = [
    'http://127.0.0.1/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://10.1.2.3/hook',
  ];

  for (const url of privateTargets) {
    test(`refuses to deliver to ${url}`, async () => {
      const res = await handleAlertsDispatch(
        reqWith({ verification: LOW_TRUST, webhook_url: url, channel: 'slack' }),
        ENV,
      );
      // Rules DO fire for LOW_TRUST, so this proves the block happens at delivery.
      assert.equal(res.status, 502);
      const json = await res.json();
      assert.equal(json.alerted, false);
      assert.match(json.delivery.error, /SSRF/);
    });
  }
});
