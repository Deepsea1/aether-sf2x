#!/usr/bin/env node
// Harness for app/src/lib/cosmos/graph.js — the Cosmos graph engine.
//
//   node scripts/cosmos-graph-harness.mjs
//
// graph.js is deliberately pure so it can be tested without a browser, a build step or a
// test runner. Its one import is the design tokens, through Vite's '@' alias, which node
// cannot resolve — so we rewrite that single specifier to a file:// URL and import the
// result. Nothing else about the source is touched.
//
// The load-bearing assertions here are the ones that guard the visual law:
//   · prominence never leaks graph degree (10x the edges → zero weight change);
//   · every node type yields at least one next action (law #5, no dead ends);
//   · an empty lens returns an explanation rather than nothing;
//   · the force layout is bit-for-bit deterministic for a given seed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', 'app');

const src = fs.readFileSync(path.join(APP, 'src/lib/cosmos/graph.js'), 'utf8')
  .replace("'@/lib/design/tokens'", JSON.stringify(pathToFileURL(path.join(APP, 'src/lib/design/tokens.js')).href));
const shim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cosmos-')), 'graph.mjs');
fs.writeFileSync(shim, src);

const G = await import(pathToFileURL(shim).href);

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
};

const NOW = Date.parse('2026-08-11T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();

// Shaped exactly like a live warrantRegistry `.chain`, including the awkward rows: a
// zero-source warrant, a zero-evidence warrant, an expired one, an unsigned one, and two
// rows sharing an answer version with disagreeing verdicts.
const CHAIN = [
  { warrant_id: 'wrt_alpha', created_date: day(2), answer_version_id: 'ans_1', validity_status: 'valid', confidence_score: 0.91, sources_count: 6, premises_count: 4, signed_hash: 'sf2x_aaa', evidence_preserved: 6 },
  { warrant_id: 'wrt_beta', created_date: day(41), answer_version_id: 'ans_2', validity_status: 'expired', confidence_score: 0.62, sources_count: 0, premises_count: 2, signed_hash: 'sf2x_bbb', evidence_preserved: 0 },
  { warrant_id: 'wrt_gamma', created_date: day(9), answer_version_id: 'ans_1', validity_status: 'invalid', confidence_score: 0.3, sources_count: 3, premises_count: 3, signed_hash: 'sf2x_ccc', evidence_preserved: 1 },
  { warrant_id: 'wrt_delta', created_date: day(120), answer_version_id: 'ans_3', validity_status: 'revoked', confidence_score: 0.5, sources_count: 2, premises_count: 1, signed_hash: '', evidence_preserved: 2 },
];
const EXTRAS = {
  now: NOW,
  head: { head_id: 'h1', tree_size: 500, merkle_root: 'deadbeefdeadbeef', signed_head: 'sig', key_id: 'k1', created_date: day(1) },
  keys: [{ key_id: 'k1', algorithm: 'Ed25519', public_key_pem: 'x', status: 'active' }],
  driftMode: { mode: 'normal', since: day(30), reason: 'nominal' },
  capabilityCard: { domain_pack_id: 'default' },
  enforcing: { allowed: true, reasons: [] },
  publishedClaims: [], // searchClaims is empty in production — the page must survive that
};

console.log('\n== shaping ==');
const g = G.toGraph(CHAIN, EXTRAS);
ok('produces nodes and edges', g.nodes.length > 0 && g.edges.length > 0, `${g.nodes.length} nodes / ${g.edges.length} edges`);
ok('every node type is in the §21.2 vocabulary', g.nodes.every((n) => G.NODE_TYPES.includes(n.type)),
  [...new Set(g.nodes.map((n) => n.type))].join(','));
ok('every edge type is in the §21.2 vocabulary', g.edges.every((e) => G.EDGE_TYPES.includes(e.type)),
  [...new Set(g.edges.map((e) => e.type))].join(','));
ok('node ids are unique', new Set(g.nodes.map((n) => n.id)).size === g.nodes.length);
ok('every edge endpoint resolves to a node', (() => {
  const ids = new Set(g.nodes.map((n) => n.id));
  return g.edges.every((e) => ids.has(e.source) && ids.has(e.target));
})());
ok('four warrants in → four warrant nodes out', g.nodes.filter((n) => n.type === 'warrant').length === 4);
ok('expired maps to the stale state, never a green one', g.nodes.find((n) => n.id === 'warrant:wrt_beta')?.state === 'stale');
ok('revoked maps to revoked', g.nodes.find((n) => n.id === 'warrant:wrt_delta')?.state === 'revoked');
ok('invalid maps to unsupported', g.nodes.find((n) => n.id === 'warrant:wrt_gamma')?.state === 'unsupported');
ok('zero sources becomes a gap node, not a silent absence', !!g.nodes.find((n) => n.id === 'gap:wrt_beta:sources'));
ok('zero evidence becomes a gap node', !!g.nodes.find((n) => n.id === 'gap:wrt_beta:evidence'));
ok('source COUNTS do not become invented source identities',
  g.nodes.filter((n) => n.type === 'source').length === 3, 'one bundle per warrant that cites any');
ok('a real disagreement produces exactly one contradiction node',
  g.nodes.filter((n) => n.type === 'contradiction').length === 1);
ok('the NEWER warrant supersedes the older on the same answer version',
  g.edges.some((e) => e.type === 'supersedes' && e.source === 'warrant:wrt_alpha' && e.target === 'warrant:wrt_gamma'));
ok('the registry enum maps to real states, not a wall of unknown', (() => {
  const m = ['valid', 'weak', 'invalid', 'insufficient_evidence', 'contested', 'expired'].map(G.stateFromValidity);
  return m.join(',') === 'supported,qualified,unsupported,unknown,contested,stale';
})(), ['valid', 'weak', 'invalid', 'insufficient_evidence', 'contested', 'expired'].map(G.stateFromValidity).join(','));
ok('an unrecognised status still falls through to unknown, never up',
  G.stateFromValidity('definitely_fine') === 'unknown' && G.stateFromValidity(undefined) === 'unknown');
ok('nothing is fabricated when the chain is empty', (() => {
  const e = G.toGraph([], { now: NOW });
  return e.nodes.length === 0 && e.edges.length === 0;
})());
ok('junk input degrades rather than throwing', (() => {
  const e = G.toGraph(null, {});
  const f = G.toGraph([null, {}, { warrant_id: 'x' }], { now: NOW });
  return e.nodes.length === 0 && f.nodes.some((n) => n.id === 'warrant:x');
})());

console.log('\n== the prominence law ==');
ok('computeWeight takes a node only — it cannot see the edge list', G.computeWeight.length <= 2, `arity ${G.computeWeight.length}`);
const before = new Map(g.nodes.map((n) => [n.id, n.weight]));
const doubled = G.toGraph(CHAIN, EXTRAS);
doubled.edges = doubled.edges.flatMap((e) => Array.from({ length: 10 }, () => ({ ...e })));
ok('10x the edges changes no weight by a single bit',
  doubled.nodes.every((n) => before.get(n.id) === G.computeWeight(n, NOW)));
const hub = { id: 'hub', type: 'question', state: 'unknown', label: 'h', meta: { createdAt: day(400) }, degree: 999, edges: 999 };
const lone = { id: 'lone', type: 'warrant', state: 'supported', label: 'l', meta: { createdAt: day(1), signed: true, inLog: true, publiclyVerifiable: true, evidencePreserved: 3, confidence: 0.95 } };
ok('a lone signed warrant outweighs a 999-degree question',
  G.computeWeight(lone, NOW) > G.computeWeight(hub, NOW),
  `${G.computeWeight(lone, NOW).toFixed(3)} > ${G.computeWeight(hub, NOW).toFixed(3)}`);
ok('weights stay inside [0.12, 1]', g.nodes.every((n) => n.weight >= 0.12 && n.weight <= 1));
ok('a 90-day-old artifact sits at half freshness', G.freshnessOf(day(90), NOW) > 0.49 && G.freshnessOf(day(90), NOW) < 0.51,
  G.freshnessOf(day(90), NOW).toFixed(3));
ok('an undated artifact is neither fresh nor stale (0.5)', G.freshnessOf(null, NOW) === 0.5);
ok('the breakdown shown in the UI matches computeWeight exactly',
  g.nodes.every((n) => G.weightBreakdown(n, NOW).total === G.computeWeight(n, NOW)));

console.log('\n== no dead ends (law #5) ==');
const everyType = G.NODE_TYPES.map((t) => ({ id: `t:${t}`, type: t, state: 'unknown', label: t, meta: {} }));
ok('every node type in the vocabulary yields >= 1 next action',
  everyType.every((n) => G.nextActionsFor(n).length > 0));
ok('every real node yields >= 1 next action', g.nodes.every((n) => G.nextActionsFor(n).length > 0));
ok('every action has a label and a destination',
  [...g.nodes, ...everyType].every((n) => G.nextActionsFor(n).every((a) => a.label && (a.to || a.href))));
ok('a warrant action points at /proof with its own identifier',
  G.nextActionsFor(g.nodes.find((n) => n.type === 'warrant')).some((a) => a.to.startsWith('/proof?q=')));

console.log('\n== lenses ==');
const avail = G.lensAvailability(g);
ok('all ten lenses report a count', Object.keys(avail).length === 10, JSON.stringify(avail));
ok('the conflict lens finds the real conflict', avail.conflict > 0);
ok('the unknowns lens finds the gaps', avail.unknowns > 0);
ok('the opportunity lens is honestly empty against this data', avail.opportunity === 0);
const oppo = G.applyLens(g, 'opportunity');
ok('an empty lens returns an explanation, not just nothing', oppo.empty && oppo.emptyReason.length > 20, oppo.emptyReason);
ok('every lens states in one line what it reveals', Object.keys(avail).every((k) => G.lensLine(k).length > 10));
ok('lens ordering is deterministic across rebuilds', (() => {
  const a = G.applyLens(g, 'evidence').nodes.map((n) => n.id).join('|');
  const b = G.applyLens(G.toGraph(CHAIN, EXTRAS), 'evidence').nodes.map((n) => n.id).join('|');
  return a === b;
})());
ok('lens emphasis stays a mix of the three legal factors',
  G.applyLens(g, 'evidence').nodes.every((n) => n.emphasis >= 0 && n.emphasis <= 1));

console.log('\n== layout determinism ==');
const runLayout = () => { const s = G.createLayout(g, { width: 900, height: 600, seed: 7 }); s.run(200); return [Array.from(s.x), Array.from(s.y)]; };
const [x1, y1] = runLayout();
const [x2, y2] = runLayout();
ok('two runs of the same seed are bit-identical',
  x1.every((v, i) => v === x2[i]) && y1.every((v, i) => v === y2[i]));
const s3 = G.createLayout(g, { width: 900, height: 600, seed: 8 }); s3.run(200);
ok('a different seed produces a different layout', Array.from(s3.x).some((v, i) => v !== x1[i]));
ok('no NaN or Infinity escapes the simulation', x1.every(Number.isFinite) && y1.every(Number.isFinite));
ok('makeRng is deterministic and in [0,1)', (() => {
  const a = G.makeRng(42); const b = G.makeRng(42);
  const va = [a(), a(), a()]; const vb = [b(), b(), b()];
  return va.every((v, i) => v === vb[i]) && va.every((v) => v >= 0 && v < 1);
})());
ok('layoutPositions returns one coordinate per node', G.layoutPositions(g, { seed: 3 }, 60).size === g.nodes.length);
ok('an empty graph lays out without throwing', (() => {
  const s = G.createLayout({ nodes: [], edges: [] }, {}); s.run(10); return s.count === 0;
})());

console.log('\n== ~1000-node layout timing ==');
const bigChain = Array.from({ length: 250 }, (_, i) => ({
  warrant_id: `w${i}`,
  created_date: day(i % 200),
  answer_version_id: `a${i % 230}`,
  validity_status: ['valid', 'expired', 'invalid', 'revoked', 'insufficient_evidence'][i % 5],
  confidence_score: (i % 100) / 100,
  sources_count: i % 4,
  premises_count: i % 6,
  signed_hash: i % 3 ? `sf2x_${i}` : '',
  evidence_preserved: i % 3,
}));
const t0shape = performance.now();
const big = G.toGraph(bigChain, EXTRAS);
const tShape = performance.now() - t0shape;
const sim = G.createLayout(big, { width: 1400, height: 900, seed: 11 });
const t0 = performance.now();
sim.run(120);
const ms = performance.now() - t0;
console.log(`  toGraph → ${big.nodes.length} nodes / ${big.edges.length} edges in ${tShape.toFixed(1)}ms`);
console.log(`  120 layout ticks: ${ms.toFixed(1)}ms (${(ms / 120).toFixed(2)}ms per tick)`);
ok('the layout settles in under 4s at ~1000 nodes', ms < 4000, `${ms.toFixed(0)}ms`);
ok('one tick fits inside a 60fps frame budget at ~1000 nodes', ms / 120 < 16.7, `${(ms / 120).toFixed(2)}ms/tick`);
ok('the big layout is finite', Array.from(sim.x).every(Number.isFinite));
ok('the big layout is deterministic too', (() => {
  const s = G.createLayout(big, { width: 1400, height: 900, seed: 11 }); s.run(120);
  return Array.from(s.x).every((v, i) => v === sim.x[i]);
})());

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
