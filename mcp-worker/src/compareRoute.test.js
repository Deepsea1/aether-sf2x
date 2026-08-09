/**
 * Tests for POST /compare — the HTTP edge.
 *
 * Run: node --test src/compareRoute.test.js   (from mcp-worker/)
 *
 * This is the only route that spends money at third-party vendors, so the tests that
 * matter most are the ones proving it CANNOT spend when it should not: no bearer, no
 * vendor key, no warrant API. None of these tests configure a real key, so none of
 * them can reach a vendor.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleCompare } from './compareRoute.js';

const TOKEN = 'test-static-bearer-value';
const BASE_ENV = { AETHER_MCP_TOKEN: TOKEN };

function reqWith(body, { token = TOKEN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('https://worker.test/compare', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('auth — fails closed before any vendor call', () => {
  test('401 with no bearer', async () => {
    const res = await handleCompare(reqWith({ prompt: 'hi' }, { token: null }), BASE_ENV);
    assert.equal(res.status, 401);
  });

  test('401 with a wrong bearer', async () => {
    const res = await handleCompare(reqWith({ prompt: 'hi' }, { token: 'wrong' }), BASE_ENV);
    assert.equal(res.status, 401);
  });

  test('401 when no token is configured (no fail-open)', async () => {
    const res = await handleCompare(reqWith({ prompt: 'hi' }), {});
    assert.equal(res.status, 401);
  });
});

describe('input validation', () => {
  test('400 on malformed JSON', async () => {
    const res = await handleCompare(reqWith('{nope'), BASE_ENV);
    assert.equal(res.status, 400);
  });

  test('400 without a prompt', async () => {
    const res = await handleCompare(reqWith({ models: ['gpt-4o'] }), BASE_ENV);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /prompt is required/);
  });

  test('413 on an oversize prompt', async () => {
    const res = await handleCompare(reqWith({ prompt: 'x'.repeat(9000) }), BASE_ENV);
    assert.equal(res.status, 413);
  });

  test('400 on an unknown format', async () => {
    const res = await handleCompare(reqWith({ prompt: 'hi', format: 'pdf' }), BASE_ENV);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /format must be one of/);
  });
});

describe('cost gate — nothing runs without a configured key', () => {
  test('503 when no vendor key is set, and it names what each model needs', async () => {
    const res = await handleCompare(reqWith({ prompt: 'Do employees get 15 days?' }), BASE_ENV);
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.match(json.error, /no comparison models are available/);
    // Every registry model is reported with the env var it requires.
    assert.ok(json.configured_models.length >= 4);
    assert.ok(json.configured_models.every((m) => typeof m.requires === 'string' && m.requires.length > 0));
  });

  test('skipped names every unavailable model AND the missing key', async () => {
    const res = await handleCompare(
      reqWith({ prompt: 'q', models: ['gpt-4o', 'gemini-1.5-pro'] }),
      BASE_ENV,
    );
    const json = await res.json();
    const reasons = json.skipped.map((s) => s.reason).join(' ');
    assert.match(reasons, /OPENAI_API_KEY is not configured/);
    assert.match(reasons, /GOOGLE_API_KEY is not configured/);
  });

  test('an unknown model id is reported, not silently ignored', async () => {
    const res = await handleCompare(reqWith({ prompt: 'q', models: ['gpt-5-imaginary'] }), BASE_ENV);
    const json = await res.json();
    assert.match(json.skipped.map((s) => s.reason).join(' '), /unknown model id/);
  });

  test('503 when a key exists but the warrant API is not configured — verification is not optional', async () => {
    const res = await handleCompare(reqWith({ prompt: 'q', models: ['gpt-4o'] }), {
      ...BASE_ENV,
      OPENAI_API_KEY: 'sk-test-not-real',
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /AETHER_WARRANT_API_URL is not configured/);
  });
});
