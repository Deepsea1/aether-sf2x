// Characterization tests for serviceMode.js (MASTER_PLAN v5 §15.3/§15.4) —
// locks the append-only mode ledger semantics: latest row IS the mode, read
// failures are flagged never hidden, transitions validate the taxonomy, and
// nothing here can take down a caller's hot path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, DEGRADED_FORCES_ADVISORY, getActiveMode, setMode } from '../serviceMode.js';

// Minimal svc stub around ServiceModeEvent.
const stubSvc = ({ rows = [], failList = false, failCreate = false, onCreate } = {}) => ({
  entities: {
    ServiceModeEvent: {
      list: async () => { if (failList) throw new Error('db down'); return rows; },
      create: async (r) => { if (failCreate) throw new Error('write denied'); onCreate?.(r); return { id: 'evt1', ...r }; },
    },
  },
});

test('taxonomy: exactly the §15.3 modes, and every advisory-forcing mode is in it', () => {
  assert.equal(MODES.length, 10);
  assert.ok(MODES.includes('normal'));
  for (const m of DEGRADED_FORCES_ADVISORY) assert.ok(MODES.includes(m), `${m} outside taxonomy`);
  assert.ok(!DEGRADED_FORCES_ADVISORY.includes('normal'));
});

test('no events yet → honest normal, no error flag', async () => {
  const out = await getActiveMode(stubSvc());
  assert.deepEqual(out, { mode: 'normal' });
});

test('latest event row is the current mode, with since/reason', async () => {
  const out = await getActiveMode(stubSvc({
    rows: [{ mode: 'cost_limited', created_date: '2026-08-11T00:00:00Z', reason: 'budget tripped' }],
  }));
  assert.equal(out.mode, 'cost_limited');
  assert.equal(out.reason, 'budget tripped');
  assert.equal(out.since, '2026-08-11T00:00:00Z');
});

test('read failure reports normal WITH mode_read_error — degradation is labeled, not hidden', async () => {
  const out = await getActiveMode(stubSvc({ failList: true }));
  assert.equal(out.mode, 'normal');
  assert.equal(out.mode_read_error, true);
});

test('a logged mode outside the taxonomy cannot be interpreted → flagged normal', async () => {
  const out = await getActiveMode(stubSvc({ rows: [{ mode: 'turbo_mode' }] }));
  assert.equal(out.mode, 'normal');
  assert.equal(out.mode_read_error, true);
});

test('setMode rejects modes outside the taxonomy with { error }, never a throw', async () => {
  const out = await setMode(stubSvc(), { mode: 'turbo_mode', reason: 'nope' });
  assert.ok(out.error && out.error.includes('invalid mode'));
});

test('setMode records previous_mode from the ledger and defaults', async () => {
  let created = null;
  const svc = stubSvc({
    rows: [{ mode: 'cost_limited', created_date: 'x', reason: 'r' }],
    onCreate: (r) => { created = r; },
  });
  const out = await setMode(svc, { mode: 'normal', reason: 'recovered', actor_id: 'admin1' });
  assert.equal(out.mode, 'normal');
  assert.equal(created.previous_mode, 'cost_limited');
  assert.equal(created.auto, false);
  assert.ok(!('indicator' in created), 'indicator must be omitted, never null');
});

test('setMode fills honest defaults for blank reason/actor', async () => {
  let created = null;
  await setMode(stubSvc({ onCreate: (r) => { created = r; } }), { mode: 'cost_limited', reason: '   ' });
  assert.equal(created.reason, '(no reason given)');
  assert.equal(created.actor_id, 'system');
});

test('setMode write failure comes back as { error }, hot path survives', async () => {
  const out = await setMode(stubSvc({ failCreate: true }), { mode: 'cost_limited', reason: 'r' });
  assert.ok(out.error);
});
