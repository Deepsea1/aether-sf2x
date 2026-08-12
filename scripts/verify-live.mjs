#!/usr/bin/env node
// verify-live.mjs — the committed live-verification suite for aether.sf2x.com.
//
// Every prior "full verification pass" was an ad-hoc harness that died with its
// session; this file is the durable replacement. It asserts the POST-P4 public
// contract of the deployed app: transparency ops, fail-closed auth on every
// consolidated host, the §20 display-eligibility rail, the §15 service-mode
// surface, the §18 capability-card surface, and (with an API key) the full
// verify → warrant → eligibility round-trip.
//
// Zero dependencies, Node 20+. Read-only against production except the keyed
// verify round-trip, which creates one Inquiry/AnswerVersion/Warrant lineage —
// that write path IS the probe (it proves service-role writes survive strict
// entity RLS, the 2d7dccd regression).
//
// Usage:
//   node scripts/verify-live.mjs                       # public probes only
//   AETHER_API_KEY=... node scripts/verify-live.mjs    # + keyed round-trips
//   node scripts/verify-live.mjs --only B1,B2          # subset by id
//   node scripts/verify-live.mjs --json report.json    # machine-readable copy
//
// Exit code: 0 all pass (skips allowed), 1 any fail. Run pre-deploy to watch
// new-contract probes fail (red), post-deploy to watch them pass (green).

import { createHash } from 'node:crypto';
import fs from 'node:fs';

const BASE = (process.env.AETHER_BASE_URL || 'https://aether.sf2x.com').replace(/\/+$/, '');
const API_KEY = (process.env.AETHER_API_KEY || '').trim();
const FN = (name) => `${BASE}/api/functions/${name}`;

// §15.3 TrustServiceMode taxonomy — mirrored from app/base44/shared/serviceMode.js
// (inlined so the suite stays standalone and catches accidental taxonomy drift).
const MODES = [
  'normal', 'degraded_read_only', 'evidence_retrieval_degraded',
  'model_evaluation_degraded', 'signing_degraded', 'revalidation_backlog',
  'cost_limited', 'security_incident', 'manual_review_only', 'emergency_freeze',
];

// Stable canary: trivially verifiable claims so the tribunal verdict — and thus
// the §20 eligibility round-trip that depends on validity_status — is stable.
const CANARY = 'Water boils at 100 degrees Celsius at standard sea-level pressure. The Earth orbits the Sun once per year.';

const sha256hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, { method = 'POST', body, query, key } = {}) {
  const url = FN(name) + (query ? `?${new URLSearchParams(query)}` : '');
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const ms = Date.now() - started;
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body stays null */ }
  return { status: res.status, json, ms };
}

// Shared state harvested by earlier probes for later ones.
const ctx = { warrantId: null, lineageId: null, verify: null };

// Each probe: { id, name, needsKey?, run() -> throws on failure, returns detail string }.
const probes = [
  // ── A. Public transparency (P2/P3 + §20 eligibility rail) ──────────────────
  {
    id: 'A1', name: 'registry default: append-only log + merkle root', run: async () => {
      // limit 25, not 5: the chain projection only carries signed_hash for
      // legacy-signed rows, and a burst of v2-only warrants can fill the first
      // page — A7 needs at least one legacy row to harvest.
      const r = await call('warrantRegistry', { body: { limit: 25 } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.registry !== 'sf2x_warrants') throw new Error('registry tag missing');
      if (typeof r.json.root !== 'string' || !Array.isArray(r.json.chain)) throw new Error('root/chain missing');
      // The public chain projection carries no row id (privacy boundary) —
      // harvest signed_hash instead; the eligibility op's lookup ladder takes it.
      ctx.warrantSignedHash = r.json.chain.find((c) => c.signed_hash)?.signed_hash || null;
      return `root ${r.json.root.slice(0, 12)}… · ${r.json.count} in window · merkle ${String(r.json.merkle_root || '').slice(0, 12)}…`;
    },
  },
  {
    id: 'A2', name: 'op=keys: signed Ed25519 key discovery', run: async () => {
      const r = await call('warrantRegistry', { method: 'GET', query: { op: 'keys' } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.schema !== 'aether.keys.v1') throw new Error(`schema ${r.json?.schema}`);
      const k = r.json.keys?.[0];
      if (k?.algorithm !== 'Ed25519' || !k?.public_key_pem) throw new Error('key entry malformed');
      if (!/^sf2x_ed25519_/.test(r.json.signature || '')) throw new Error('document not Ed25519-self-signed');
      return `key ${k.key_id} · self-signed`;
    },
  },
  {
    id: 'A3', name: 'op=checkpoint: signed tree head readable', run: async () => {
      const r = await call('warrantRegistry', { method: 'GET', query: { op: 'checkpoint' } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.registry !== 'sf2x_warrants' || !('head' in r.json)) throw new Error('head missing');
      const h = r.json.head;
      return h ? `tree_size ${h.tree_size} · root ${String(h.root || h.root_hash || h.merkle_root || '').slice(0, 12)}…` : 'no checkpoint yet (readable, empty)';
    },
  },
  {
    id: 'A4', name: 'registry unknown op fails closed 400', run: async () => {
      const r = await call('warrantRegistry', { method: 'GET', query: { op: 'definitely_bogus' } });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400`);
      return '400';
    },
  },
  {
    id: 'A5', name: 'op=eligibility: malformed hash → 400 + recipe', run: async () => {
      const r = await call('warrantRegistry', { method: 'GET', query: { op: 'eligibility', content_sha256: 'not-a-hash' } });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400`);
      if (!r.json?.hash_recipe) throw new Error('hash_recipe missing from 400');
      return '400 + hash_recipe';
    },
  },
  {
    id: 'A6', name: 'op=eligibility: unknown warrant → 404 ineligible', run: async () => {
      const r = await call('warrantRegistry', {
        method: 'GET',
        query: { op: 'eligibility', warrant_id: 'no_such_warrant_0000', content_sha256: '0'.repeat(64) },
      });
      if (r.status !== 404) throw new Error(`status ${r.status}, want 404`);
      if (r.json?.eligible !== false) throw new Error('eligible must be false');
      return '404 eligible:false';
    },
  },
  {
    id: 'A7', name: 'op=eligibility: real warrant + wrong hash → ineligible', run: async () => {
      if (!ctx.warrantSignedHash) return 'SKIP: no signed warrant harvested from A1';
      const r = await call('warrantRegistry', {
        method: 'GET',
        query: { op: 'eligibility', signed_hash: ctx.warrantSignedHash, content_sha256: '0'.repeat(64) },
      });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.eligible !== false) throw new Error('wrong hash must never be eligible');
      if (!Array.isArray(r.json.reasons) || r.json.reasons.length === 0) throw new Error('reasons must explain the refusal');
      return `eligible:false — ${r.json.reasons[0]}`;
    },
  },

  // ── B. Fail-closed auth on every consolidated host (the carried fixes) ─────
  {
    id: 'B1', name: 'prepareReview default op sessionless → 401 (was 500)', run: async () => {
      const r = await call('prepareReview', { body: {} });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B2', name: 'prepareReview op=resolve_review sessionless → 401 (was 500)', run: async () => {
      const r = await call('prepareReview', { body: { op: 'resolve_review', review_id: 'x', decision: 'approved', rationale: 'probe' } });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B3', name: 'prepareReview unknown op → 400', run: async () => {
      const r = await call('prepareReview', { body: { op: 'bogus' } });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400`);
      return '400';
    },
  },
  {
    id: 'B4', name: 'keyExpirySweep sessionless → 401', run: async () => {
      const r = await call('keyExpirySweep', { body: {} });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B5', name: 'verifyLedgerIntegrity sessionless → 401 (was 500)', run: async () => {
      const r = await call('verifyLedgerIntegrity', { body: {} });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B6', name: 'publishCalibration default sessionless → 401', run: async () => {
      const r = await call('publishCalibration', { body: {} });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B7', name: 'driftAlert default sessionless → 401', run: async () => {
      const r = await call('driftAlert', { body: {} });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B8', name: 'driftAlert op=set_mode sessionless → 401', run: async () => {
      const r = await call('driftAlert', { body: { op: 'set_mode', mode: 'normal', reason: 'probe — must be rejected' } });
      if (r.status !== 401) throw new Error(`status ${r.status}, want 401`);
      return '401';
    },
  },
  {
    id: 'B9', name: 'driftAlert unknown op → 400', run: async () => {
      const r = await call('driftAlert', { body: { op: 'bogus' } });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400`);
      return '400';
    },
  },
  {
    id: 'B10', name: 'publishCalibration unknown op → 400', run: async () => {
      const r = await call('publishCalibration', { body: { op: 'bogus' } });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400`);
      return '400';
    },
  },

  // ── C. §15 service-mode surface ────────────────────────────────────────────
  {
    id: 'C1', name: 'driftAlert op=mode: public mode + transition log', run: async () => {
      const r = await call('driftAlert', { method: 'GET', query: { op: 'mode' } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (!MODES.includes(r.json?.mode)) throw new Error(`mode '${r.json?.mode}' outside §15.3 taxonomy`);
      if (!Array.isArray(r.json.transitions)) throw new Error('transitions missing');
      return `mode ${r.json.mode} · ${r.json.transitions.length} transitions`;
    },
  },

  // ── D. §18 capability-card surface ─────────────────────────────────────────
  {
    id: 'D1', name: 'capability_card: public read + server-side §18.2 verdict', run: async () => {
      const r = await call('publishCalibration', { body: { op: 'capability_card', domain_pack_id: 'technical-docs@1.0' } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.domain_pack_id !== 'technical-docs@1.0') throw new Error('pack id mismatch');
      if (!('card' in r.json)) throw new Error('card field missing');
      const e = r.json.enforcing;
      if (typeof e?.allowed !== 'boolean' || !Array.isArray(e?.reasons)) throw new Error('enforcing verdict malformed');
      return `card ${r.json.card ? 'present' : 'null'} · enforcing ${e.allowed ? 'UNLOCKED' : `locked (${e.reasons.length} reasons)`}`;
    },
  },

  // ── E. Keyed round-trips (needs AETHER_API_KEY) ────────────────────────────
  {
    id: 'E1', name: 'verifyResponse round-trip (writes survive strict RLS)', needsKey: true, run: async () => {
      const r = await call('verifyResponse', { body: { text: CANARY, source: 'verify-live-suite' }, key: API_KEY });
      if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
      if (!['verified', 'contested', 'rejected'].includes(r.json?.verdict)) throw new Error(`verdict ${r.json?.verdict}`);
      if (!r.json.warrant_id || !r.json.lineage_id) throw new Error('warrant/lineage missing — Inquiry write path broken?');
      ctx.verify = r.json;
      ctx.lineageId = r.json.lineage_id;
      return `verdict ${r.json.verdict} · trust ${r.json.trust_score} · warrant ${r.json.warrant_id.slice(0, 8)}… · ${r.json.latency_ms}ms${r.json.cached ? ' (cached)' : ''}`;
    },
  },
  {
    id: 'E2', name: 'verifyResponse stamps service_mode (§15.4 labeling)', needsKey: true, run: async () => {
      if (!ctx.verify) throw new Error('E1 did not run');
      if (!MODES.includes(ctx.verify.service_mode)) throw new Error(`service_mode '${ctx.verify.service_mode}' missing or outside taxonomy`);
      return `service_mode ${ctx.verify.service_mode}`;
    },
  },
  {
    id: 'E3', name: 'verdict reuse: identical text → cached', needsKey: true, run: async () => {
      const r = await call('verifyResponse', { body: { text: CANARY, source: 'verify-live-suite' }, key: API_KEY });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.cached !== true) throw new Error('repeat was not served from the reuse cache');
      if (!MODES.includes(r.json?.service_mode)) throw new Error('cache hit lost the service_mode stamp');
      return `cached:true · age ${r.json.cache_age_seconds}s · mode ${r.json.service_mode}`;
    },
  },
  {
    id: 'E4', name: 'verifyAnswer public proof for the new lineage', needsKey: true, run: async () => {
      if (!ctx.lineageId) throw new Error('E1 did not run');
      const r = await call('verifyAnswer', { body: { answer_version_id: ctx.lineageId } });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (typeof r.json?.signature_valid !== 'boolean') throw new Error('signature_valid missing');
      // A v2-signed warrant MUST verify on the public proof surface. Reporting
      // signature_valid:false for a correctly signed warrant is the inverse of
      // the honesty law — it makes a real proof look forged.
      if (r.json.signature_valid !== true) {
        throw new Error(`public proof reports signature_valid:false (scheme '${r.json.signature_scheme}') for a warrant this pipeline just signed`);
      }
      return `scheme ${r.json.signature_scheme} · signature_valid ${r.json.signature_valid} · ${r.json.certification}`;
    },
  },
  {
    id: 'E5', name: '§20 eligibility round-trip: exact text → eligible', needsKey: true, run: async () => {
      if (!ctx.verify) throw new Error('E1 did not run');
      // Hash recipe: verifyResponse persists text.slice(0, 4000).
      const hash = sha256hex(CANARY.slice(0, 4000));
      const r = await call('warrantRegistry', {
        method: 'GET',
        query: { op: 'eligibility', warrant_id: ctx.verify.warrant_id, content_sha256: hash },
      });
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (r.json?.checked?.content_hash_match !== true) throw new Error(`content_hash_match false — hash recipe drifted? reasons: ${(r.json?.reasons || []).join('; ')}`);
      if (ctx.verify.verdict === 'verified' && r.json.eligible !== true) throw new Error(`verified warrant + exact text must be eligible; reasons: ${(r.json?.reasons || []).join('; ')}`);
      if (ctx.verify.verdict !== 'verified' && r.json.eligible !== false) throw new Error('non-valid warrant must never be display-eligible');
      return `eligible:${r.json.eligible} (verdict ${ctx.verify.verdict}) · content_hash_match:true`;
    },
  },
  {
    id: 'E6', name: 'webhookVerify SSRF guard rejects link-local target', needsKey: true, run: async () => {
      const r = await call('webhookVerify', { body: { text: 'probe', webhook_url: 'http://169.254.169.254/hook' }, key: API_KEY });
      if (r.status !== 400) throw new Error(`status ${r.status}, want 400 (SSRF guard)`);
      return '400 invalid webhook_url';
    },
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const only = args.includes('--only') ? (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean) : [];
const jsonPath = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const results = [];
console.log(`aether verify-live · ${BASE} · key ${API_KEY ? 'present' : 'ABSENT (keyed probes skip)'} · ${new Date().toISOString()}`);
console.log('asserting the POST-P4 contract — pre-deploy runs are EXPECTED to show red on new-contract probes\n');

for (const p of probes) {
  if (only.length && !only.includes(p.id)) continue;
  if (p.needsKey && !API_KEY) {
    results.push({ id: p.id, name: p.name, outcome: 'SKIP', detail: 'AETHER_API_KEY not set' });
    console.log(`SKIP ${p.id.padEnd(3)} ${p.name} — no API key`);
    continue;
  }
  try {
    const detail = await p.run();
    if (typeof detail === 'string' && detail.startsWith('SKIP:')) {
      results.push({ id: p.id, name: p.name, outcome: 'SKIP', detail: detail.slice(5).trim() });
      console.log(`SKIP ${p.id.padEnd(3)} ${p.name} — ${detail.slice(5).trim()}`);
    } else {
      results.push({ id: p.id, name: p.name, outcome: 'PASS', detail });
      console.log(`PASS ${p.id.padEnd(3)} ${p.name} — ${detail}`);
    }
  } catch (e) {
    results.push({ id: p.id, name: p.name, outcome: 'FAIL', detail: e?.message || String(e) });
    console.log(`FAIL ${p.id.padEnd(3)} ${p.name} — ${e?.message || e}`);
  }
  await sleep(300);
}

const tally = { pass: 0, fail: 0, skip: 0 };
for (const r of results) tally[r.outcome.toLowerCase()]++;
console.log(`\n${tally.pass} pass · ${tally.fail} fail · ${tally.skip} skip`);

if (jsonPath) {
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, at: new Date().toISOString(), results, tally }, null, 2));
  console.log(`report written: ${jsonPath}`);
}
process.exitCode = tally.fail > 0 ? 1 : 0;
