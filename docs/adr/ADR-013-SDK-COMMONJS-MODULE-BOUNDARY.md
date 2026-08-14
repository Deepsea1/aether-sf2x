# ADR-013: JavaScript SDK CommonJS module boundary

**Status:** accepted
**Date:** 2026-08-13
**Decision owner:** Aether platform
**Required reviewers:** SDK/API compatibility and release review

## Context

The published JavaScript SDK documents CommonJS `require()` import forms. In a
desktop workspace whose ancestor package declares `"type": "module"`, Node
interprets `sdk/aether_sdk.js` as ESM and rejects its intentional
`module.exports` contract before tests run.

## Decision

Add `sdk/package.json` with `"type": "commonjs"`. The SDK remains a dependency-
free CommonJS artifact and retains both documented export forms. This is a
package-boundary declaration only; it does not change endpoint behavior,
authentication, evidence status, proof level, warrant semantics, or action
authorization.

## Alternatives considered

1. Rename the SDK to `.cjs` — rejected because it breaks documented file paths.
2. Convert it to ESM — rejected because it breaks documented `require()` usage.
3. Depend on the enclosing workspace package — rejected because it is not a
   stable consumer boundary.

## Compatibility, testing, and rollback

- Compatibility: preserve `require('./aether_sdk')` and destructured export use.
- Test: run `node --test aether_sdk.test.mjs` under the desktop workspace.
- Rollback: remove the nested package boundary only if the SDK is formally
  migrated with a versioned ESM compatibility adapter.

## Residual risk

This proves loadability, not endpoint deployment or live API behavior.
