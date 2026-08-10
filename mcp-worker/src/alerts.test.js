/**
 * Tests for the Slack/Teams alerting layer.
 *
 * Run: node --test src/alerts.test.js   (from mcp-worker/)
 *
 * These lock the honesty properties as hard as the happy path: an absent trust score
 * must not read as zero, a payload with no claim breakdown must say so rather than
 * imply everything passed, and a customer-supplied webhook URL must never reach the
 * network if the SSRF guard rejects it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AETHER_PUBLIC_ORIGIN,
  DEFAULT_RULES,
  buildAlert,
  buildSlackMessage,
  buildTeamsMessage,
  dispatchAlert,
  evaluateAlertRules,
  inferChannel,
  normalizeVerification,
  severityOf,
  supportedClaims,
  trustGauge,
  unsupportedClaims,
} from './alerts.js';

// The three real shapes, taken from docs/API_REFERENCE.md + docs/INTEGRATION_GUIDE.md
// and mcp-core.js's cached record.
const VERIFY_RESPONSE = {
  trust_score: 40,
  verdict: 'contested',
  corrections: ['Cite the specific employer and provide the exact text or link to Section 4.1'],
  claims: [
    { claim: 'According to Section 4.1, employees get 15 vacation days.', supported: false, notes: 'No source or employer is cited.' },
    { claim: 'Employees accrue vacation time.', supported: true, notes: '' },
  ],
  warrant_id: '6a6de04b26cf84c8aa37847f',
  tribunal_url: '/verify/6a6de04b14738e49e8db0ee0',
  lineage_id: '6a6de04b14738e49e8db0ee0',
  domain: 'HR',
};

const WEBHOOK_EVENT = {
  event: 'verification.complete',
  data: {
    verification_id: 'vrf_1234567890',
    trust_score: 45,
    verdict: 'rejected',
    flags: ['Unverified citation reference detected', 'Absolute/overgeneralized claim detected'],
    text_preview: 'First 200 chars of verified text...',
    timestamp: '2026-08-01T12:00:00.000Z',
  },
};

const WORKER_RECORD = {
  verification_id: 'lin_abc',
  warrant_id: 'wrt_abc',
  verdict: 'verified',
  trust_score: 91,
  certified: true,
  certification: 'certified',
  premises: [{ premise: 'The tribunal ran end to end.', supported: true }],
  sources: [{ url: 'https://example.com', excerpt: '' }],
  created_at: '2026-08-09T00:00:00.000Z',
};

describe('normalizeVerification — one model from three shapes', () => {
  test('reads the verifyResponse shape', () => {
    const v = normalizeVerification(VERIFY_RESPONSE);
    assert.equal(v.trustScore, 40);
    assert.equal(v.verdict, 'contested');
    assert.equal(v.claims.length, 2);
    assert.equal(v.corrections.length, 1);
    assert.equal(v.warrantId, '6a6de04b26cf84c8aa37847f');
    assert.equal(v.verificationId, '6a6de04b14738e49e8db0ee0');
  });

  test('unwraps the webhook `data` envelope', () => {
    const v = normalizeVerification(WEBHOOK_EVENT);
    assert.equal(v.trustScore, 45);
    assert.equal(v.verdict, 'rejected');
    assert.equal(v.verificationId, 'vrf_1234567890');
    assert.equal(v.flags.length, 2);
    assert.equal(v.timestamp, '2026-08-01T12:00:00.000Z');
  });

  test('reads the worker record, mapping `premises` to claims', () => {
    const v = normalizeVerification(WORKER_RECORD);
    assert.equal(v.trustScore, 91);
    assert.equal(v.claims.length, 1);
    assert.equal(v.claims[0].supported, true);
    assert.equal(v.certified, true);
  });

  test('resolves a relative tribunal_url to an absolute warrant link', () => {
    const v = normalizeVerification(VERIFY_RESPONSE);
    assert.equal(v.warrantUrl, `${AETHER_PUBLIC_ORIGIN}/verify/6a6de04b14738e49e8db0ee0`);
  });

  test('falls back to /verify/<id> when no tribunal_url is given', () => {
    const v = normalizeVerification(WEBHOOK_EVENT);
    assert.equal(v.warrantUrl, `${AETHER_PUBLIC_ORIGIN}/verify/vrf_1234567890`);
  });

  test('keeps an absolute tribunal_url untouched', () => {
    const v = normalizeVerification({ tribunal_url: 'https://elsewhere.test/v/1' });
    assert.equal(v.warrantUrl, 'https://elsewhere.test/v/1');
  });

  test('an absent trust score stays null — it is NOT zero', () => {
    const v = normalizeVerification({ verdict: 'contested' });
    assert.equal(v.trustScore, null);
  });

  test('an unstated `supported` stays null, not false', () => {
    const v = normalizeVerification({ claims: [{ claim: 'x' }] });
    assert.equal(v.claims[0].supported, null);
    assert.equal(unsupportedClaims(v).length, 0);
    assert.equal(supportedClaims(v).length, 0);
  });

  test('never throws on junk input', () => {
    for (const junk of [null, undefined, 'nope', 42, [], {}]) {
      assert.doesNotThrow(() => normalizeVerification(junk));
      assert.equal(normalizeVerification(junk).trustScore, null);
    }
  });
});

describe('evaluateAlertRules', () => {
  test('fires below the score threshold and says why', () => {
    const d = evaluateAlertRules(normalizeVerification(VERIFY_RESPONSE));
    assert.equal(d.shouldAlert, true);
    assert.match(d.reasons.join(' '), /Trust score 40 is below the threshold of 70/);
  });

  test('does not fire on a healthy verification', () => {
    const d = evaluateAlertRules(normalizeVerification(WORKER_RECORD));
    assert.equal(d.shouldAlert, false);
    assert.deepEqual(d.reasons, []);
  });

  test('fires on a watched verdict', () => {
    const d = evaluateAlertRules(normalizeVerification({ verdict: 'rejected', trust_score: 95 }));
    assert.equal(d.shouldAlert, true);
    assert.match(d.reasons.join(' '), /Verdict is "rejected"/);
  });

  test('an absent score does NOT fire the score rule (no false alarm)', () => {
    const d = evaluateAlertRules(normalizeVerification({ verdict: 'contested' }));
    assert.equal(d.shouldAlert, false);
  });

  test('fabricated citation fires in a high-risk domain', () => {
    const d = evaluateAlertRules(
      normalizeVerification({
        trust_score: 95,
        domain: 'Legal',
        flags: ['Unverified citation reference detected'],
      }),
    );
    assert.equal(d.shouldAlert, true);
    assert.match(d.reasons.join(' '), /high-risk domain \(Legal\)/);
  });

  test('the same citation does NOT fire in a general domain by default', () => {
    const d = evaluateAlertRules(
      normalizeVerification({
        trust_score: 95,
        domain: 'General',
        flags: ['Unverified citation reference detected'],
      }),
    );
    assert.equal(d.shouldAlert, false);
  });

  test('fabricatedCitationAnywhere opts into every domain', () => {
    const d = evaluateAlertRules(
      normalizeVerification({ trust_score: 95, domain: 'General', flags: ['fabricated source'] }),
      { fabricatedCitationAnywhere: true },
    );
    assert.equal(d.shouldAlert, true);
  });

  test('a caller threshold overrides the default', () => {
    const v = normalizeVerification({ trust_score: 80, verdict: 'verified' });
    assert.equal(evaluateAlertRules(v).shouldAlert, false);
    assert.equal(evaluateAlertRules(v, { minTrustScore: 90 }).shouldAlert, true);
  });

  test('defaults are frozen so one caller cannot mutate policy for everyone', () => {
    assert.throws(() => {
      'use strict';
      DEFAULT_RULES.minTrustScore = 5;
    });
  });
});

describe('trustGauge + severity', () => {
  test('renders a proportional bar with the raw number', () => {
    assert.equal(trustGauge(40), '████░░░░░░ 40/100');
    assert.equal(trustGauge(100), '██████████ 100/100');
    assert.equal(trustGauge(0), '░░░░░░░░░░ 0/100');
  });

  test('says so plainly when there is no score — never an empty bar', () => {
    assert.equal(trustGauge(null), 'no score reported');
    assert.equal(trustGauge(undefined), 'no score reported');
  });

  test('bands the severity, and unknown when unscored', () => {
    assert.equal(severityOf(normalizeVerification({ trust_score: 20 })), 'critical');
    assert.equal(severityOf(normalizeVerification({ trust_score: 60 })), 'warning');
    assert.equal(severityOf(normalizeVerification({ trust_score: 91 })), 'ok');
    assert.equal(severityOf(normalizeVerification({})), 'unknown');
  });
});

describe('buildSlackMessage', () => {
  const msg = buildSlackMessage(normalizeVerification(VERIFY_RESPONSE), {
    reasons: ['Trust score 40 is below the threshold of 70'],
  });
  const json = JSON.stringify(msg);

  test('sets a notification fallback so pushes are readable', () => {
    assert.match(msg.text, /Aether flagged an AI response/);
    assert.match(msg.text, /40\/100/);
  });

  test('shows the gauge, the unsupported claim and its reason', () => {
    assert.match(json, /████░░░░░░ 40\/100/);
    assert.match(json, /unsupported claim/);
    assert.match(json, /No source or employer is cited/);
  });

  test('shows the verified claim alongside the false premise', () => {
    assert.match(json, /verified claim/);
    assert.match(json, /Employees accrue vacation time/);
  });

  test('adds a View Cryptographic Warrant button pointing at the warrant', () => {
    const actions = msg.attachments[0].blocks.find((b) => b.type === 'actions');
    assert.ok(actions, 'expected an actions block');
    assert.equal(actions.elements[0].text.text, 'View Cryptographic Warrant');
    assert.equal(actions.elements[0].url, `${AETHER_PUBLIC_ORIGIN}/verify/6a6de04b14738e49e8db0ee0`);
  });

  test('states when no per-claim breakdown was supplied instead of implying success', () => {
    const bare = buildSlackMessage(normalizeVerification(WEBHOOK_EVENT));
    assert.match(JSON.stringify(bare), /No per-claim breakdown was included/);
  });

  test('omits the button when there is nothing to link to', () => {
    const bare = buildSlackMessage(normalizeVerification({ trust_score: 10 }));
    assert.equal(bare.attachments[0].blocks.some((b) => b.type === 'actions'), false);
  });
});

describe('buildTeamsMessage', () => {
  const card = buildTeamsMessage(normalizeVerification(VERIFY_RESPONSE), { reasons: ['because'] });

  test('is a MessageCard an incoming webhook accepts as-is', () => {
    assert.equal(card['@type'], 'MessageCard');
    assert.equal(card['@context'], 'https://schema.org/extensions');
    assert.ok(card.summary, 'summary is required or Teams rejects the card');
  });

  test('carries the gauge and the warrant action', () => {
    assert.match(JSON.stringify(card.sections[0].facts), /████░░░░░░ 40\/100/);
    assert.equal(card.potentialAction[0].name, 'View Cryptographic Warrant');
  });

  test('reports an unscored verification honestly', () => {
    const c = buildTeamsMessage(normalizeVerification({ verdict: 'contested' }));
    assert.match(c.sections[0].activityTitle, /unreported/);
  });
});

describe('buildAlert — the whole pure decision', () => {
  test('returns a payload when the rules fire', () => {
    const r = buildAlert(VERIFY_RESPONSE, { channel: 'slack' });
    assert.equal(r.shouldAlert, true);
    assert.ok(r.payload);
  });

  test('returns payload null when no alert is warranted', () => {
    const r = buildAlert(WORKER_RECORD, { channel: 'slack' });
    assert.equal(r.shouldAlert, false);
    assert.equal(r.payload, null);
  });

  test('force builds a payload even when the rules stay silent', () => {
    const r = buildAlert(WORKER_RECORD, { channel: 'teams', force: true });
    assert.equal(r.shouldAlert, false);
    assert.ok(r.payload, 'force should still format a card');
  });

  test('throws on an unknown channel rather than sending nothing silently', () => {
    assert.throws(() => buildAlert(VERIFY_RESPONSE, { channel: 'carrier-pigeon' }), /unknown alert channel/);
  });
});

describe('inferChannel', () => {
  test('recognises Slack and Teams hosts', () => {
    assert.equal(inferChannel('https://hooks.slack.com/services/A/B/C'), 'slack');
    assert.equal(inferChannel('https://acme.webhook.office.com/webhookb2/xyz'), 'teams');
  });

  test('returns null when it cannot tell, rather than guessing', () => {
    assert.equal(inferChannel('https://example.com/hook'), null);
    assert.equal(inferChannel('not a url'), null);
  });
});

describe('dispatchAlert — SSRF is enforced before any request', () => {
  const blocked = [
    'http://localhost/hook',
    'http://127.0.0.1/hook',
    'http://10.0.0.5/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.1/hook',
    'http://172.16.0.1/hook',
    'http://100.64.0.1/hook', // CGNAT
    'http://224.0.0.1/hook', // multicast
    'http://[fe80::1]/hook', // IPv6 link-local
    'http://[fd00::1]/hook', // IPv6 unique-local
    'http://[::ffff:127.0.0.1]/hook', // IPv4-mapped loopback
    'http://metadata.google.internal/computeMetadata/v1/',
    'https://user:pass@hooks.slack.com/hook', // embedded credentials
    'file:///etc/passwd',
    'not-a-url',
  ];

  for (const url of blocked) {
    test(`refuses ${url} without calling fetch`, async () => {
      let called = false;
      const res = await dispatchAlert(url, { a: 1 }, { fetchImpl: async () => { called = true; return { ok: true, status: 200 }; } });
      assert.equal(called, false, 'fetch must not be reached for an unsafe URL');
      assert.equal(res.ok, false);
      assert.match(res.error, /SSRF/);
    });
  }

  test('posts JSON to a safe URL', async () => {
    let seen = null;
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      { hello: 'world' },
      { fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; } },
    );
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(seen.init.body), { hello: 'world' });
  });

  test('returns a delivery failure instead of throwing', async () => {
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async () => { throw new Error('network down'); } },
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /network down/);
  });

  test('reports a non-2xx as not ok, keeping the status', async () => {
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async () => ({ ok: false, status: 404 }) },
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  });
});

describe('dispatchAlert — redirects are re-validated, never auto-followed', () => {
  const redirect = (location) => ({
    ok: false,
    status: 302,
    headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
  });

  test('sends every request with redirect:manual', async () => {
    let seen = null;
    await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async (url, init) => { seen = init; return { ok: true, status: 200 }; } },
    );
    assert.equal(seen.redirect, 'manual');
  });

  test('a 302 to a private target is NOT followed', async () => {
    const calls = [];
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async (url) => { calls.push(url); return redirect('http://169.254.169.254/latest/meta-data'); } },
    );
    assert.deepEqual(calls, ['https://hooks.slack.com/services/A/B/C'], 'the redirect target must never be fetched');
    assert.equal(res.ok, false);
    assert.match(res.error, /SSRF/);
  });

  test('an unparseable Location is rejected, not followed', async () => {
    const calls = [];
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async (url) => { calls.push(url); return redirect('http://['); } },
    );
    assert.equal(calls.length, 1);
    assert.equal(res.ok, false);
    assert.match(res.error, /SSRF/);
  });

  test('follows a safe redirect manually, re-posting the same body', async () => {
    const calls = [];
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      { hello: 'world' },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url, body: init.body });
          return calls.length === 1 ? redirect('https://hooks.slack.com/services/D/E/F') : { ok: true, status: 200 };
        },
      },
    );
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://hooks.slack.com/services/D/E/F');
    assert.deepEqual(JSON.parse(calls[1].body), { hello: 'world' });
  });

  test('resolves a relative Location against the current target', async () => {
    const calls = [];
    await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      {
        fetchImpl: async (url) => {
          calls.push(url);
          return calls.length === 1 ? redirect('/services/moved') : { ok: true, status: 200 };
        },
      },
    );
    assert.equal(calls[1], 'https://hooks.slack.com/services/moved');
  });

  test('gives up after the hop cap instead of looping forever', async () => {
    let calls = 0;
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async () => { calls += 1; return redirect('https://hooks.slack.com/services/next'); } },
    );
    assert.equal(calls, 5);
    assert.equal(res.ok, false);
    assert.match(res.error, /too many redirects/);
  });

  test('a 3xx without a Location is returned as-is, not treated as a redirect', async () => {
    const res = await dispatchAlert(
      'https://hooks.slack.com/services/A/B/C',
      {},
      { fetchImpl: async () => ({ ok: false, status: 304 }) },
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, 304);
    assert.equal(res.error, undefined);
  });
});
