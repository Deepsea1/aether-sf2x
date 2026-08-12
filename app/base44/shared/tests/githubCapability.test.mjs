// Tests for the githubPrVerify capability boundary (shared/githubCapability.js).
//
// The contract these lock: a non-admin request can never put the backend in a
// state where it acquires Aether's platform GitHub connector token. That token
// reaches every repo it is installed on, so before this split any signed-up
// account could spend it — writing a forged "Aether verified" commit status
// anywhere, reading private PR diffs back as extracted claim text, and posting
// PR reviews under Aether's name.
//
// The guarantee is structural: entry.ts only calls connectors.getConnection
// when isAdmin is true, and every GitHub helper no-ops on a null token. So the
// job here is to prove isAdmin is never true for a non-admin, and that the two
// GitHub-requiring inputs (pull_number, and an absent diff) are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGithubCapability, evidenceFetchBudget, DEMO_EVIDENCE_FETCHES } from '../githubCapability.js';

const demo = (over = {}) => resolveGithubCapability({ role: 'user', diffText: '+ a claim', ...over });

test('admin gets the full path — GitHub operations enabled', () => {
  const out = resolveGithubCapability({ role: 'admin', pullNumber: 42, diffText: undefined });
  assert.deepEqual(out, { ok: true, isAdmin: true, githubOperationsEnabled: true });
});

test('admin needs neither a diff nor a pull_number to be authorized here', () => {
  const out = resolveGithubCapability({ role: 'admin' });
  assert.equal(out.ok, true);
  assert.equal(out.githubOperationsEnabled, true);
});

test('non-admin with a pasted diff is allowed, with GitHub operations off', () => {
  const out = demo();
  assert.deepEqual(out, { ok: true, isAdmin: false, githubOperationsEnabled: false });
});

test('non-admin asking for a PR fetch is refused 403 and told where to go', () => {
  const out = demo({ pullNumber: 42 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.match(out.error, /admin capability/);
  assert.match(out.error, /GitHub Action/);
  assert.equal(out.isAdmin, undefined);
});

test('pull_number 0 is still a PR fetch request, not a falsy pass-through', () => {
  // `if (pull_number)` would have let 0 through to the token path.
  const out = demo({ pullNumber: 0 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
});

test('a pull_number with no diff is refused as the PR fetch, not as a missing diff', () => {
  const out = resolveGithubCapability({ role: 'user', pullNumber: 7, diffText: undefined });
  assert.equal(out.status, 403);
});

test('non-admin with no diff is refused 400 — nothing to analyse without the token', () => {
  for (const diffText of [undefined, null, '', '   ', '\n\t ', 123, {}, []]) {
    const out = resolveGithubCapability({ role: 'user', diffText });
    assert.equal(out.ok, false, `diffText ${JSON.stringify(diffText)} must not pass`);
    assert.equal(out.status, 400);
  }
});

test('no role at all is a demo caller, never an admin', () => {
  assert.equal(resolveGithubCapability({ diffText: '+ x' }).isAdmin, false);
  assert.equal(resolveGithubCapability({ role: undefined, pullNumber: 1 }).status, 403);
});

test('called with nothing at all → refused, never a default-admin', () => {
  const out = resolveGithubCapability();
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

test('the admin match is exact — no case, prefix, or truthiness slack', () => {
  for (const role of ['Admin', 'ADMIN', 'admin ', ' admin', 'administrator', 'superadmin', 'api', true, 1, {}]) {
    const out = resolveGithubCapability({ role, diffText: '+ a claim' });
    assert.equal(out.isAdmin, false, `role ${JSON.stringify(role)} must not be admin`);
    assert.equal(out.githubOperationsEnabled, false);
  }
});

test('no input can make a non-admin reach the token path', () => {
  // The property that matters: across the whole input space, githubOperations
  // is enabled only when role is exactly 'admin'.
  const roles = ['user', 'api', 'Admin', undefined, null, '', true, 1];
  const pulls = [undefined, null, 0, 1, '42'];
  const diffs = [undefined, '', '+ a claim', 'x'.repeat(1000)];
  for (const role of roles) {
    for (const pullNumber of pulls) {
      for (const diffText of diffs) {
        const out = resolveGithubCapability({ role, pullNumber, diffText });
        assert.notEqual(out.githubOperationsEnabled, true,
          `role=${JSON.stringify(role)} pull=${JSON.stringify(pullNumber)} reached GitHub operations`);
      }
    }
  }
});

test('demo runs fetch nothing outbound, whatever the policy asks for', () => {
  assert.equal(DEMO_EVIDENCE_FETCHES, 0);
  for (const policyMax of [undefined, 10, 500, '999', Infinity, -1]) {
    assert.equal(evidenceFetchBudget(false, policyMax), 0,
      `demo budget must stay 0 for policy max ${String(policyMax)}`);
  }
});

test('admin evidence budget honours the policy, defaulting to 10', () => {
  assert.equal(evidenceFetchBudget(true, undefined), 10);
  assert.equal(evidenceFetchBudget(true, 25), 25);
  assert.equal(evidenceFetchBudget(true, '25'), 25);
  // Nonsense values fall back to the default rather than disabling grounding.
  for (const bad of [0, -5, 'abc', null, NaN, Infinity]) {
    assert.equal(evidenceFetchBudget(true, bad), 10, `policy max ${String(bad)} should fall back to 10`);
  }
});
