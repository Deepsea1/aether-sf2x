// Characterization tests for shared/auth.js — the admin guard that every
// privileged backend function routes through (the GitHub wedge, the export and
// sweep jobs, the tribunal escalations). It carried no test despite being the
// single place where a wrong answer hands an arbitrary caller the service
// role's reach, and the GitHub functions were reaching that role behind nothing
// but a "is there a user" check until they were moved onto this guard.
//
// These lock its four outcomes: a missing session and a failing session are
// both 401, an authenticated non-admin is 403, and only the exact role 'admin'
// returns ok with the resolved user attached. Pure — no network, no SDK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../auth.js';

// Minimal base44 stub: pass a user object, or a function to control how me() behaves.
const stub = (me) => ({ auth: { me: typeof me === 'function' ? me : async () => me } });

test('no session → 401 Unauthorized, not ok, no user handed back', async () => {
  const out = await requireAdmin(stub(null));
  assert.equal(out.ok, false);
  assert.equal(out.user, undefined);
  assert.equal(out.response.status, 401);
  assert.deepEqual(await out.response.json(), { error: 'Unauthorized' });
});

test('undefined session is treated the same as none', async () => {
  const out = await requireAdmin(stub(undefined));
  assert.equal(out.ok, false);
  assert.equal(out.response.status, 401);
});

test('a rejecting auth.me is a 401 — a broken session backend never falls open', async () => {
  const out = await requireAdmin(stub(async () => { throw new Error('session service down'); }));
  assert.equal(out.ok, false);
  assert.equal(out.response.status, 401);
  assert.deepEqual(await out.response.json(), { error: 'Unauthorized' });
});

test('a synchronously throwing auth.me is also a 401, not an unhandled throw', async () => {
  const out = await requireAdmin(stub(() => { throw new Error('boom'); }));
  assert.equal(out.ok, false);
  assert.equal(out.response.status, 401);
});

test('authenticated non-admin → 403 Admin only', async () => {
  const out = await requireAdmin(stub({ id: 'u1', role: 'user' }));
  assert.equal(out.ok, false);
  assert.equal(out.user, undefined);
  assert.equal(out.response.status, 403);
  assert.deepEqual(await out.response.json(), { error: 'Admin only' });
});

test('a user with no role at all → 403 (absence is not authority)', async () => {
  const out = await requireAdmin(stub({ id: 'u1' }));
  assert.equal(out.ok, false);
  assert.equal(out.response.status, 403);
});

test('the role match is exact — no case, prefix, or truthiness slack', async () => {
  for (const role of ['Admin', 'ADMIN', 'admin ', 'administrator', 'superadmin', 'api', true, 1]) {
    const out = await requireAdmin(stub({ id: 'u1', role }));
    assert.equal(out.ok, false, `role ${JSON.stringify(role)} must not pass as admin`);
    assert.equal(out.response.status, 403);
  }
});

test("role 'admin' → ok, with the resolved user attached and no response to return", async () => {
  const user = { id: 'u9', role: 'admin', email: 'admin@example.com' };
  const out = await requireAdmin(stub(user));
  assert.equal(out.ok, true);
  assert.equal(out.response, undefined);
  assert.deepEqual(out.user, user);
});

test('the guard reads the session itself — callers cannot pass an identity in', async () => {
  // Guards that trust a caller-supplied identity are the bug this shape avoids:
  // requireAdmin takes only the request-bound client and asks it who the caller
  // is, so there is no argument an attacker could set to claim admin.
  assert.equal(requireAdmin.length, 1);
  let calls = 0;
  const out = await requireAdmin(stub(async () => { calls++; return { id: 'u1', role: 'admin' }; }));
  assert.equal(calls, 1);
  assert.equal(out.ok, true);
});
