/**
 * Tests for the outbound-URL SSRF guard.
 *
 * Run: node --test src/ssrf.test.js   (from mcp-worker/)
 *
 * Every rejection class is locked individually: schemes, embedded credentials,
 * IPv4 private/special ranges (incl. CGNAT and multicast/reserved), IPv6 literals
 * (bracketed, and IPv4-mapped in both the dotted and the URL-normalized hex form),
 * and the named cloud-metadata hosts. Allowed boundary cases pin the range edges
 * so the guard cannot silently widen into blocking legitimate public hosts.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isSafeUrl } from './ssrf.js';

describe('isSafeUrl — allowed public targets', () => {
  const allowed = [
    'https://hooks.slack.com/services/A/B/C',
    'http://example.com/webhook',
    'https://9.9.9.9/',
    'https://223.255.255.255/', // last public /8 before multicast
    'https://100.63.255.255/', // just below CGNAT 100.64/10
    'https://100.128.0.1/', // just above CGNAT 100.64/10
    'https://172.15.0.1/', // just below 172.16/12
    'https://172.32.0.1/', // just above 172.16/12
    'http://[2001:4860:4860::8888]/', // public IPv6
    'http://[::ffff:8.8.8.8]/', // IPv4-mapped, but the mapped address is public
  ];
  for (const url of allowed) {
    test(`allows ${url}`, () => assert.equal(isSafeUrl(url), true));
  }
});

describe('isSafeUrl — schemes and junk', () => {
  const blocked = [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'ws://example.com/x',
    'javascript:alert(1)',
    'not-a-url',
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }

  test('returns false, never throws, on non-string junk', () => {
    for (const junk of [null, undefined, 42, '', {}]) {
      assert.equal(isSafeUrl(junk), false);
    }
  });
});

describe('isSafeUrl — embedded credentials', () => {
  const blocked = [
    'https://user:pass@example.com/hook',
    'https://user@example.com/hook',
    'https://:secret@example.com/hook',
    'https://user:pass@hooks.slack.com/services/A/B/C', // safe host, still rejected
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }
});

describe('isSafeUrl — localhost', () => {
  const blocked = [
    'http://localhost/hook',
    'http://sub.localhost/hook',
    'http://LOCALHOST/hook', // URL lowercases the host
    'http://localhost./hook', // trailing dot resolves the same
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }
});

describe('isSafeUrl — IPv4 private/special ranges', () => {
  const blocked = [
    'http://10.0.0.5/hook',
    'http://127.0.0.1/hook',
    'http://0.0.0.0/hook',
    'http://169.254.169.254/latest/meta-data', // link-local + cloud metadata
    'http://169.254.0.1/hook',
    'http://172.16.0.1/hook',
    'http://172.31.255.255/hook',
    'http://192.168.1.1/hook',
    'http://100.64.0.1/hook', // CGNAT 100.64/10
    'http://100.127.255.255/hook', // CGNAT upper edge
    'http://224.0.0.1/hook', // multicast
    'http://239.255.255.255/hook', // multicast upper edge
    'http://240.0.0.1/hook', // reserved 240/4
    'http://255.255.255.255/hook', // broadcast
    'http://2130706433/hook', // decimal 127.0.0.1 — URL normalizes it
    'http://0x7f000001/hook', // hex 127.0.0.1 — URL normalizes it
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }
});

describe('isSafeUrl — IPv6 literals', () => {
  const blocked = [
    'http://[::1]/hook', // loopback
    'http://[::]/hook', // unspecified
    'http://[fe80::1]/hook', // link-local fe80::/10
    'http://[FEBF::ffff]/hook', // link-local upper edge, URL lowercases
    'http://[fc00::1]/hook', // unique-local fc00::/7
    'http://[fd12:3456:789a::1]/hook', // unique-local fd00::/8
    'http://[::ffff:127.0.0.1]/hook', // IPv4-mapped loopback (dotted)
    'http://[::ffff:7f00:1]/hook', // IPv4-mapped loopback (hex form)
    'http://[::ffff:10.0.0.1]/hook', // IPv4-mapped 10/8
    'http://[::ffff:192.168.1.1]/hook', // IPv4-mapped 192.168/16
    'http://[::ffff:169.254.169.254]/hook', // IPv4-mapped metadata
    'http://[::ffff:100.64.0.1]/hook', // IPv4-mapped CGNAT
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }
});

describe('isSafeUrl — cloud metadata hostnames', () => {
  const blocked = [
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://metadata/latest/meta-data',
    'http://metadata.aws.internal/hook',
    'https://metadata.google.internal./hook', // trailing dot resolves the same
  ];
  for (const url of blocked) {
    test(`rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
  }
});
