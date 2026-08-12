// The capability boundary for functions/githubPrVerify, kept here as a pure
// function so it can be unit-tested — entry.ts imports a Deno `npm:` specifier
// and cannot be loaded by the node test runner, and a security boundary with no
// automated coverage is one refactor from being gone.
//
// The split is by what a request TOUCHES, not by who is asking. Aether's GitHub
// connector is a single platform-wide credential (Base44 connectors are one
// connection per app, and no repo-entitlement record exists), so any caller who
// can make the backend spend it can reach every repo that token reaches. Three
// operations spend it: fetching a PR diff, fetching .aether/policy.yml, and
// writing back (commit status + PR review).
//
// Everything else the endpoint does — extract claims from a supplied diff, run
// the Flash risk scan, evaluate policy, resolve dispositions — is local
// computation and is safe for any authenticated caller. So a non-admin request
// must carry its own diff and must not ask for a PR fetch; entry.ts then never
// acquires the token at all, which makes the GitHub calls unreachable rather
// than merely forbidden.
//
// Grounding (fetching cited URLs) is held back too: it is the one part of the
// pipeline that makes outbound calls on caller-supplied input, and there is no
// quota module in shared/ to meter it for unmetered signups.
export const DEMO_EVIDENCE_FETCHES = 0;

/**
 * Decide what a caller may do on this endpoint.
 * @param {{ role?: string, pullNumber?: unknown, diffText?: unknown }} input
 * @returns {{ ok: true, isAdmin: boolean, githubOperationsEnabled: boolean }
 *          | { ok: false, status: number, error: string }}
 */
export function resolveGithubCapability({ role, pullNumber, diffText } = {}) {
  // Exact match only. Anything else — undefined, 'Admin', 'administrator', a
  // truthy non-string — is not admin. Mirrors shared/auth.js requireAdmin.
  if (role === 'admin') {
    return { ok: true, isAdmin: true, githubOperationsEnabled: true };
  }

  if (pullNumber !== undefined && pullNumber !== null) {
    return {
      ok: false,
      status: 403,
      error: "pull_number fetches the diff through Aether's GitHub connector, which is an admin capability. Paste the diff as diff_text, or run the Aether GitHub Action in your own repository.",
    };
  }

  if (typeof diffText !== 'string' || !diffText.trim()) {
    return {
      ok: false,
      status: 400,
      error: 'diff_text is required — a diff is only fetched from GitHub for admin callers. Paste the diff, or run the Aether GitHub Action in your own repository.',
    };
  }

  return { ok: true, isAdmin: false, githubOperationsEnabled: false };
}

/**
 * Outbound citation-fetch budget for a run. Demo runs fetch nothing.
 * @param {boolean} isAdmin
 * @param {unknown} policyMax - policy.max_evidence_fetches, if the policy sets one
 */
export function evidenceFetchBudget(isAdmin, policyMax) {
  if (!isAdmin) return DEMO_EVIDENCE_FETCHES;
  const n = Number(policyMax);
  return Number.isFinite(n) && n > 0 ? n : 10;
}
