// Characterization tests for independence.js (MASTER_PLAN v5 §5.6) — locks
// the clustering contract the warrant pipeline depends on: same registrable
// domain, identical content hash, or near-duplicate excerpts collapse to one
// origin; unknown never merges with unknown; corroboration reads per cluster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain, clusterSources } from '../independence.js';

// ── registrableDomain ────────────────────────────────────────────────────────

test('registrable domain: strips scheme, path, port, userinfo', () => {
  assert.equal(registrableDomain('https://user@www.example.com:8443/a/b?q=1#f'), 'example.com');
});

test('registrable domain: ccTLD second-level registries keep three labels', () => {
  assert.equal(registrableDomain('https://www.bbc.co.uk/news'), 'bbc.co.uk');
  // …and two different co.uk sites are DIFFERENT origins.
  assert.notEqual(registrableDomain('https://news.co.uk/a'), registrableDomain('https://bbc.co.uk/b'));
});

test('registrable domain: deep subdomains collapse to the registrable name', () => {
  assert.equal(registrableDomain('https://a.b.c.example.com/x'), 'example.com');
});

test('registrable domain: IP literals cluster by exact IP', () => {
  assert.equal(registrableDomain('http://192.168.0.1:8080/x'), '192.168.0.1');
  assert.equal(registrableDomain('http://[2001:db8::1]:443/x'), '2001:db8::1');
});

test('registrable domain: trailing dots and case are normalized', () => {
  assert.equal(registrableDomain('HTTPS://Example.COM./'), 'example.com');
});

test('registrable domain: unparseable input returns a string, never throws', () => {
  assert.equal(typeof registrableDomain(null), 'string');
  assert.equal(registrableDomain(''), '');
  assert.equal(typeof registrableDomain('   '), 'string');
});

// ── clusterSources ───────────────────────────────────────────────────────────

test('empty input: zero clusters, zero flags', () => {
  const out = clusterSources([]);
  assert.equal(out.independent_origins, 0);
  assert.deepEqual(out.clusters, []);
  assert.deepEqual(out.flags, []);
});

test('single source is its own origin', () => {
  const out = clusterSources([{ url: 'https://example.com/a' }]);
  assert.equal(out.independent_origins, 1);
  assert.equal(out.clusters[0].reason, 'domain');
});

test('same registrable domain merges; different domains stay independent', () => {
  const same = clusterSources([
    { url: 'https://docs.example.com/1' },
    { url: 'https://blog.example.com/2' },
  ]);
  assert.equal(same.independent_origins, 1);
  const diff = clusterSources([
    { url: 'https://example.com/1' },
    { url: 'https://other.org/2' },
  ]);
  assert.equal(diff.independent_origins, 2);
});

test('identical content hash across different domains merges + flags syndication', () => {
  const out = clusterSources([
    { url: 'https://wire.example.com/story', content_hash: 'AbC123' },
    { url: 'https://mirror.other.org/story', content_hash: 'abc123' }, // case-insensitive
  ]);
  assert.equal(out.independent_origins, 1);
  assert.ok(out.flags.includes('syndicated_copies'));
  assert.equal(out.clusters[0].reason, 'content_hash');
});

test('near-duplicate excerpts (8-word shingles, Jaccard >= 0.6) merge cross-domain', () => {
  const text = 'the quick brown fox jumps over the lazy dog every single morning without fail';
  const out = clusterSources([
    { url: 'https://a-site.com/x', excerpt: text },
    { url: 'https://b-site.net/y', excerpt: text + ' indeed' },
  ]);
  assert.equal(out.independent_origins, 1);
  assert.equal(out.clusters[0].reason, 'near_dup');
});

test('short excerpts (< 8 words) can never near-dup merge — fail closed toward uncertainty', () => {
  const out = clusterSources([
    { url: 'https://a-site.com/x', excerpt: 'exact same seven word excerpt here now' },
    { url: 'https://b-site.net/y', excerpt: 'exact same seven word excerpt here now' },
  ]);
  assert.equal(out.independent_origins, 2);
});

test('unknown origins never merge on the empty domain', () => {
  const out = clusterSources([{ excerpt: 'no url one' }, { excerpt: 'no url two' }]);
  assert.equal(out.independent_origins, 2);
});

test('2+ items collapsing to one cluster flags single_origin_corroboration', () => {
  const out = clusterSources([
    { url: 'https://example.com/1' },
    { url: 'https://example.com/2' },
  ]);
  assert.ok(out.flags.includes('single_origin_corroboration'));
});

test('merges are transitive: A~B by domain, B~C by hash → one cluster', () => {
  const out = clusterSources([
    { url: 'https://example.com/a' },
    { url: 'https://example.com/b', content_hash: 'h1' },
    { url: 'https://elsewhere.org/c', content_hash: 'h1' },
  ]);
  assert.equal(out.independent_origins, 1);
  assert.deepEqual(out.clusters[0].members, [0, 1, 2]);
});

test('deterministic: identical input produces identical output', () => {
  const items = [
    { url: 'https://example.com/a', excerpt: 'alpha beta gamma delta epsilon zeta eta theta iota' },
    { url: 'https://other.org/b', content_hash: 'zz' },
    { url: 'https://example.com/c' },
  ];
  assert.deepEqual(clusterSources(items), clusterSources(items));
});

test('malformed items never throw', () => {
  const out = clusterSources([null, {}, { url: 42 }, { content_hash: '  ' }, { excerpt: null }]);
  assert.equal(typeof out.independent_origins, 'number');
});
