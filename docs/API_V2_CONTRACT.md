# Aether API v2 Contract

> **Status: DRAFT — 2026-08-10. Nothing in this document is implemented or live.**
> This is the target contract for the `/v2` surface from
> [MASTER_PLAN v5 §23](./AETHER_MASTER_PLAN_V5.md) mapped over today's live v1
> functions. v1 (documented in [API_REFERENCE.md](./API_REFERENCE.md)) remains the
> only live surface. Rows and cells marked **OPEN** need an owner decision before
> this contract freezes.

## 1. Endpoint set and v1 mapping

The v2 surface is the §23.1 set. The right column is what exists **today** — the
live Base44 function a v2 endpoint will front, or `— new` where v1 has no public
equivalent (nearest internal machinery noted).

| v2 endpoint (§23.1) | Today's live function (v1) |
|---|---|
| `POST /v2/artifacts` | — new (v1 has no artifact registry; text is inlined per call) |
| `POST /v2/verifications` | `POST /api/functions/verifyResponse` (single) · `batchVerify` (≤ 50 texts, per-text metered) · `streamVerify` (SSE progressive) · `webhookVerify` (verify + deliver) |
| `GET /v2/verifications/{id}` | `POST /api/functions/warrantRegistry` `{ verification_id }` (integrity metadata) · app page `/verify/{id}` (full detail, authenticated) |
| `GET /v2/verifications/{id}/events` | — new (the hash-chained `AuditLog` ledger exists internally; `verifyLedgerIntegrity` checks it; no per-verification event feed) |
| `GET /v2/claims/{id}` | `POST /api/functions/searchClaims` (public, hard-scoped to `is_public: true` claims only) |
| `GET /v2/claims/{id}/evidence` | `generateEvidencePack` (admin-only today — v2 opens a tenant-scoped subset) |
| `POST /v2/claims/{id}/challenge` | — new (nearest: `escalateToTribunal`, internal) |
| `POST /v2/warrants` | `POST /api/functions/warrantApi` (single) · `batchWarrant` (≤ 25, whole-batch headroom check) |
| `GET /v2/warrants/{id}` | `POST /api/functions/warrantRegistry` `{ warrant_id }` |
| `GET /v2/warrants/{id}/proof` | `warrantRegistry` → `verified_warrant.inclusion_proof` (RFC6962-SHA256; see API_REFERENCE.md "Independent warrant verification (v2)") |
| `GET /v2/warrants/{id}/dependents` | — new |
| `POST /v2/warrants/{id}/revalidate` | `POST /api/functions/revalidateWarrant` |
| `POST /v2/warrants/{id}/challenge` | — new (nearest: `debateAndValidateCorrection`, internal) |
| `POST /v2/missions` · `POST /v2/missions/{id}/experiments` | — new (Forge is not exposed as an API) |
| `POST /v2/forge/sessions` · `POST /v2/forge/sessions/{id}/hypotheses` | — new |
| `POST /v2/experiments/{id}/observations` | — new |
| `POST /v2/webhooks` | — new as a standing registration (today: per-call delivery via `webhookVerify`; `WebhookConfig` rows are app-managed, not API-managed) |
| `GET /.well-known/aether-keys.json` | **LIVE** — static pointer → `/api/functions/warrantRegistry?op=keys` (signed key document) |

## 2. `ClaimVerdict` and the lossy v1 mapping

v2 verdicts are **per-claim**, produced by the deterministic resolver (§8), never
by a model directly:

```ts
export type ClaimVerdict =
  | "verified_for_stated_use"
  | "supported_with_limits"
  | "needs_review"
  | "not_supported"
  | "contradicted"
  | "out_of_scope"
  | "blocked"
  | "unknown";              // honest abstention — never silent
```

v1 collapses everything into one whole-text `verified` / `contested` /
`rejected`. Both shims are **lossy by construction** and documented as such.

### v1 → v2 (reading old records through the v2 lens)

| v1 verdict | v2 `ClaimVerdict` | What is lost |
|---|---|---|
| `verified` | `verified_for_stated_use` | v1 carries no stated use, scope, or per-claim granularity; the shim synthesizes an unscoped stated use. Also collapses what v2 would split into `supported_with_limits`. |
| `contested` | `needs_review` | v1 conflates "partly supported", "actively contradicted", and "insufficient evidence" — `needs_review` is the only target that never overstates. **OPEN:** whether corrections mentioning explicit counterevidence should map to `contradicted` instead. |
| `rejected` | `not_supported` | v1 does not distinguish absence of support from active counterevidence. **OPEN:** `not_supported` vs `contradicted` as the default target. |

### v2 → v1 (the compat shim frozen v1 consumers receive)

| v2 `ClaimVerdict` | v1 verdict | Note |
|---|---|---|
| `verified_for_stated_use` | `verified` | |
| `supported_with_limits` | `contested` | Conservative: limits are invisible in v1, so never inflate to `verified`. **OPEN.** |
| `needs_review` | `contested` | |
| `not_supported` | `rejected` | |
| `contradicted` | `rejected` | |
| `out_of_scope` | `contested` | v1 has no neutral state. **OPEN.** |
| `blocked` | `rejected` | |
| `unknown` | `contested` | Honest abstention must not read as `verified`. **OPEN.** |

Batch/whole-text rollups (v1 `batch_verdict`) derive from the worst per-claim
verdict, not from an average — averaging is exactly the laundering v2 removes.

## 3. `trust_score` is display-only in v2

v2 responses return per-claim `ClaimVerdict`s plus the six evaluation dimensions
— `support`, `coverage`, `applicability`, `freshness`, `consistency`,
`traceability` — surfaced **separately**. `trust_score` survives only as an
optional display summary (e.g. `display.trust_score`), never a decision input:

- No v2 gate, resolver rung, or SDK helper may branch on `trust_score`.
- SDKs expose it under a display namespace, not at the response root.
- Documentation and marketing quote the dimensions, not the single number.

## 4. Deprecation policy

- **v1 freezes at v2 GA: bugfix-only.** No new v1 endpoints, parameters, or
  semantics. The 2026-08-10 deploy (per-text batch metering, SSRF-guarded
  webhooks, whole-batch headroom) is the shape v1 freezes in — §23.2's
  precondition ("server-side per-text metering lands before any new batch
  marketing") is met.
- **Deprecation window ≥ 90 days** from the dated deprecation announcement,
  with dashboard notices and `Deprecation`/`Sunset` response headers on every
  v1 call.
- **SDKs bump major versions** for v2 (`aether.ts`, `aether.py`); the v1 SDK
  majors receive fixes only.
- **The MCP worker fronts v2** (OAuth 2.1 + SSE, shipped) and exposes the
  mission/claims tools.
- **Signing migration is already underway** (§23.3): warrants dual-sign
  (legacy + `aether.warrant.v2`) today; new warrants become v2-only after the
  dual-sign window; legacy warrants stay verifiable forever via archived
  verification logic and published key history.

## 5. Open questions (decide before freeze)

1. **`contested`/`rejected` mapping targets** — see the OPEN cells in §2. One
   decision per cell, recorded here.
2. **Batch shape** — does `POST /v2/verifications` accept an array of artifacts
   (folding `batchVerify` in), or does batching get its own endpoint? Either
   way, §7.3 metering (per claim-run, whole-batch headroom, reject-not-trim) is
   non-negotiable.
3. **Auth carrier** — `x-api-key` carries over vs OAuth 2.1 everywhere (the MCP
   worker is already OAuth). If both, which wins when both are presented?
4. **HTTP verbs** — the §23.1 set uses `GET` for reads; today's Base44
   functions are POST-shaped. Does v2 front them with a gateway/rewrite layer,
   or do the functions grow verb handling?
5. **Canonical id** — v1 lookup accepts `warrant_id`, `verification_id`,
   `lineage_id`, or `signed_hash` interchangeably. v2 should pick one canonical
   id per resource and make the others explicit query parameters, not guesses.
6. **Webhook registration** — `POST /v2/webhooks` implies API-managed
   `WebhookConfig` (create/rotate secret/delete). Secret handling and the SSRF
   guard at registration time (not just delivery time) need a spec.
7. **`trust_score` visibility** — present in v2 responses by default under
   `display`, or only on request (`?include=display`)?
