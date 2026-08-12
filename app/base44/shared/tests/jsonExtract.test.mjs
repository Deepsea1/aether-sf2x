// Tests for jsonExtract.js — pulling a JSON object out of an LLM response that
// may not be pure JSON.
//
// Why it exists: callAnthropicJson did `JSON.parse(stripFences(text))`, which
// requires the ENTIRE response to be JSON. Current Claude models often emit a
// sentence of preamble, so 18 of 30 items in the 2026-08-12 gate-0 run died
// with "Anthropic returned non-JSON" — the model answered correctly and the
// parser threw it away. Asking for JSON is not the same as being handed only
// JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, describeSchema } from '../jsonExtract.js';

// ── describeSchema: the field contract the Anthropic path was missing ────────

test('describeSchema names every top-level field so the model cannot omit one', () => {
  // llmRouter passed `schema` to the Base44 tier only; the Anthropic call got
  // the prompt alone. VERIFY_SCHEMA requires `confidence`, the prompt asked for
  // it in prose, and the model returned it under whatever name it liked — so
  // verifierConfidence read 0 on every verification and trust was permanently
  // capped at support_ratio x 60.
  const s = describeSchema({
    type: 'object',
    properties: {
      claims: { type: 'array' },
      overall_validity: { type: 'string', enum: ['valid', 'weak', 'invalid'] },
      confidence: { type: 'number' },
    },
    required: ['claims', 'overall_validity', 'confidence'],
  });
  assert.ok(s.includes('confidence'), 'the field that was silently missing must be named');
  assert.ok(s.includes('overall_validity'));
  assert.ok(s.includes('claims'));
});

test('describeSchema surfaces enum values and required fields', () => {
  const s = describeSchema({
    type: 'object',
    properties: { overall_validity: { type: 'string', enum: ['valid', 'weak', 'invalid'] } },
    required: ['overall_validity'],
  });
  assert.ok(/valid.*weak.*invalid/s.test(s), `enum values must be stated: ${s}`);
  assert.ok(/required/i.test(s));
});

test('describeSchema returns empty string for a missing or malformed schema', () => {
  for (const bad of [undefined, null, {}, 'nope', 42, { properties: null }]) {
    assert.equal(describeSchema(bad), '', `expected '' for ${JSON.stringify(bad)}`);
  }
});

test('pure JSON parses', () => {
  assert.deepEqual(extractJsonObject('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test('surrounding whitespace is tolerated', () => {
  assert.deepEqual(extractJsonObject('\n\n  {"a":1}  \n'), { a: 1 });
});

test('```json fenced blocks parse', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('```\n{"a":1}\n```'), { a: 1 });
});

test('leading prose before the object is skipped — the real failure mode', () => {
  const text = 'Here is my analysis of the claim:\n\n{"claims":[{"claim":"x","supported":true}]}';
  assert.deepEqual(extractJsonObject(text), { claims: [{ claim: 'x', supported: true }] });
});

test('trailing prose after the object is skipped', () => {
  assert.deepEqual(extractJsonObject('{"a":1}\n\nLet me know if you need more detail.'), { a: 1 });
});

test('prose on both sides still yields the object', () => {
  assert.deepEqual(extractJsonObject('Sure!\n{"a":1}\nHope that helps.'), { a: 1 });
});

test('nested objects and arrays survive the brace scan', () => {
  const obj = { a: { b: { c: [1, { d: 2 }] } }, e: 'f' };
  assert.deepEqual(extractJsonObject('preamble ' + JSON.stringify(obj) + ' postamble'), obj);
});

test('braces INSIDE strings do not truncate the scan', () => {
  const obj = { claim: 'the set {a, b} is closed', ok: true };
  assert.deepEqual(extractJsonObject('note: ' + JSON.stringify(obj)), obj);
});

test('escaped quotes inside strings do not truncate the scan', () => {
  const obj = { claim: 'he said "it is }" loudly', ok: true };
  assert.deepEqual(extractJsonObject(JSON.stringify(obj) + ' trailing'), obj);
});

test('a prefilled response missing its opening brace is recovered', () => {
  // We prefill the assistant turn with "{" to force JSON-first output, so the
  // returned text starts AFTER that brace.
  assert.deepEqual(extractJsonObject('"a":1,"b":2}', { assumeOpenBrace: true }), { a: 1, b: 2 });
});

test('assumeOpenBrace still prefers a complete object when one is present', () => {
  assert.deepEqual(extractJsonObject('{"a":1}', { assumeOpenBrace: true }), { a: 1 });
});

test('unrecoverable input returns null rather than throwing', () => {
  for (const bad of ['', '   ', 'no json here at all', '{"unterminated": ', null, undefined, 42, {}]) {
    assert.equal(extractJsonObject(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('a bare array is not an object — returns null', () => {
  // Every caller expects an object shape; silently accepting an array would
  // push the failure downstream into schema handling.
  assert.equal(extractJsonObject('[1,2,3]'), null);
});
