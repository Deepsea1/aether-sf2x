/**
 * Tests for the JavaScript SDK.
 *
 * Run: node --test sdk/aether_sdk.test.mjs
 *
 * Every test injects its own fetch, so nothing here touches the network. The cases
 * that matter are the ones the inline README version got wrong: the auth header, the
 * export shape, and silently resolving a 401 as if it were a verification result.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('./aether_sdk.js');
const { AetherClient, AetherError, NotDeployedError, DEFAULT_BASE_URL } = mod;

const OK = { trust_score: 91, verdict: 'verified', corrections: [] };
const okFetch = async () => ({ ok: true, status: 200, json: async () => OK });

describe('exports — both documented import styles work', () => {
  test('the module itself is the class (require(...) form)', () => {
    assert.equal(typeof mod, 'function');
    assert.equal(mod.name, 'AetherClient');
  });

  test('the destructured form also works — this was broken before', () => {
    // docs use: const { AetherClient } = require("./aether_sdk")
    assert.equal(typeof AetherClient, 'function');
    assert.ok(new AetherClient('k', { fetchImpl: okFetch }) instanceof AetherClient);
  });

  test('error classes are exported', () => {
    assert.equal(typeof AetherError, 'function');
    assert.equal(typeof NotDeployedError, 'function');
  });
});

describe('auth header', () => {
  test('sends x-api-key, NOT Authorization: Bearer', async () => {
    let seen = null;
    const c = new AetherClient('sk-test', {
      fetchImpl: async (url, init) => {
        seen = init;
        return { ok: true, status: 200, json: async () => OK };
      },
    });
    await c.verify('hello');
    assert.equal(seen.headers['x-api-key'], 'sk-test');
    assert.equal(seen.headers.Authorization, undefined);
  });

  test('omits the header entirely when there is no key', () => {
    const c = new AetherClient('', { fetchImpl: okFetch });
    assert.equal('x-api-key' in c.headers, false);
  });

  test('defaults to the app-domain base URL, not api.base44.com', () => {
    assert.equal(DEFAULT_BASE_URL, 'https://aether.sf2x.com/api/functions');
    assert.ok(!DEFAULT_BASE_URL.includes('api.base44.com'));
  });
});

describe('verify', () => {
  test('posts to /verifyResponse and returns the parsed body', async () => {
    let url = null;
    const c = new AetherClient('k', {
      fetchImpl: async (u) => {
        url = u;
        return { ok: true, status: 200, json: async () => OK };
      },
    });
    const out = await c.verify('some text');
    assert.match(url, /\/verifyResponse$/);
    assert.equal(out.trust_score, 91);
  });

  test('rejects empty text before making a request', async () => {
    let called = false;
    const c = new AetherClient('k', { fetchImpl: async () => { called = true; } });
    await assert.rejects(() => c.verify('   '), /text is required/);
    assert.equal(called, false);
  });

  test('THROWS on a non-2xx instead of resolving the error body', async () => {
    const c = new AetherClient('', {
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'Missing x-api-key header' }) }),
    });
    await assert.rejects(() => c.verify('x'), (err) => {
      assert.ok(err instanceof AetherError);
      assert.equal(err.status, 401);
      assert.match(err.message, /no API key was provided/);
      return true;
    });
  });

  test('surfaces a network failure as AetherError, not a raw throw', async () => {
    const c = new AetherClient('k', { fetchImpl: async () => { throw new Error('ECONNRESET'); } });
    await assert.rejects(() => c.verify('x'), /request to .* failed: ECONNRESET/);
  });
});

describe('undeployed endpoints fail clearly, not with a mystery 404', () => {
  test('batchVerify throws NotDeployedError without calling fetch', async () => {
    let called = false;
    const c = new AetherClient('k', { fetchImpl: async () => { called = true; } });
    await assert.rejects(() => c.batchVerify(['a']), (err) => {
      assert.ok(err instanceof NotDeployedError);
      assert.match(err.message, /not deployed/);
      return true;
    });
    assert.equal(called, false);
  });

  test('verifyWebhook throws NotDeployedError', async () => {
    const c = new AetherClient('k', { fetchImpl: okFetch });
    await assert.rejects(() => c.verifyWebhook('a', 'https://x.test/h'), NotDeployedError);
  });

  test('input validation still runs first', async () => {
    const c = new AetherClient('k', { fetchImpl: okFetch });
    await assert.rejects(() => c.batchVerify([]), /non-empty array/);
    await assert.rejects(() => c.batchVerify(new Array(51).fill('x')), /at most 50/);
  });
});

describe('helpers', () => {
  test('getTrustScore returns 0 when no score was reported', async () => {
    const c = new AetherClient('k', {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ verdict: 'verified' }) }),
    });
    assert.equal(await c.getTrustScore('x'), 0);
  });

  test('isVerified gates on the threshold', async () => {
    const c = new AetherClient('k', { fetchImpl: okFetch });
    assert.equal(await c.isVerified('x', 80), true);
    assert.equal(await c.isVerified('x', 95), false);
  });

  test('a missing score fails the gate rather than passing it', async () => {
    const c = new AetherClient('k', {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ verdict: 'verified' }) }),
    });
    assert.equal(await c.isVerified('x', 80), false);
  });
});
