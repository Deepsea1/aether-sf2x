# Aether Implementation Checkpoints

## CP-000 — canonical truth-layer plan imported

**Status:** COMPLETE (documentation transfer only)

- Canonical plan: `AETHER_NUMBER_ONE_TRUTH_LAYER_BUILD_PLAN.md`
- Source SHA-256 at import: `f1b1278a3089bbf4593f6d36696cd99b48c37899c7f53d4240e666323e2f2582`
- Source was a user-supplied canonical document. The committed Markdown differs
  only by removal of trailing whitespace so it passes repository diff checks.

## CP-001 — audited baseline reproduced

**Status:** PARTIAL — local deterministic evidence reproduced; SDK packaging
and all build/lint/typecheck/staging/live gates remain open.

| Surface | Commit / environment | Result | Evidence |
|---|---|---|---|
| Aether repository baseline | `d4f996bc4ffaab6750cd71a2ddcaab199367811c`, local Windows | LOCAL / clean before this documentation slice | `git status --short` was empty before edits |
| Base44 shared deterministic modules | same commit, local Node | PASS | `node --test base44/shared/tests/*.test.mjs`: 147/147 |
| MCP worker deterministic modules | same commit, local Node | PASS | `node --test src/*.test.js`: 214/214 |
| GitHub Action deterministic modules | same commit, local Node | PASS | `node --test gate.test.mjs`: 41/41 |
| JavaScript SDK | Phase 0 follow-up, local Node | PASS | `sdk/package.json` establishes the nested CommonJS boundary; `node --test aether_sdk.test.mjs`: 17/17 |
| App dependency installation | `npm ci` from committed lockfile | BLOCKED | exceeded the 120-second local command budget before completion |
| App build, lint, typecheck | not run | UNKNOWN | lint first showed `eslint` unavailable; the lockfile install did not complete |
| Authenticated staging/live | not run | UNKNOWN | credentials and approved target evidence unavailable |

## Open checkpoint blockers

1. Complete a reproducible dependency installation, then obtain app build,
   lint, and typecheck evidence.
2. Audit every factual serving path for the five separate dimensions:
   `truth_status`, `evidence_basis`, `proof_level`, `integrity_status`, and
   `action_authorization`.
3. Do not select the divergent local `verification-suite-deployed-24de9d`
   checkout as a baseline without an explicit merge/review decision.

## CP-002 — Phase 1 canonical truth-decision contract

**Status:** IN PROGRESS

- Contract: `app/base44/shared/truthContract.js`
- Schema: `aether.truth-decision.v1`
- Architecture decision: `docs/adr/ADR-014-Federated-Truth-Decision-Contract.md`
- Deterministic guard: `node --test app/base44/shared/tests/truthContract.test.mjs`

The contract preserves `truth_status`, `evidence_basis`, `proof_level`,
`integrity_status`, and `action_authorization` as independent fields. Its first
hard rule is that a model-only assessment is `UNKNOWN + MODEL_ASSESSED + L1`;
it cannot issue a factual `VERIFIED` result or action authorization.

## Next smallest safe task

Map and migrate every factual-serving response path to expose the canonical
contract alongside legacy fields, starting with `verifyResponse`. Do not remove
legacy fields until the Base44 app, MCP worker, SDK, GitHub Action, browser
extension, batch, webhook, and tribunal consumers have contract tests.
