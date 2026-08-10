# Aether — Remaining Build Plan

> **SUPERSEDED (2026-08-10).** The canonical plan is now [`../docs/AETHER_MASTER_PLAN_V5.md`](../docs/AETHER_MASTER_PLAN_V5.md)
> and its gap register (§28). Audit result for the six tasks below: #1 auto-fetch DONE in code
> (only the connector scope re-auth remains — dashboard action); #2 ledger integrity DONE
> (endpoint + Trust Center card); #3 PR UI polish DONE (commit 0057890); #4 public claims DONE,
> hardened after the pr_diff leak (8ee141d, eec0253); #5 shipped as `warrantRegistry` +
> `/warrant-proof` under different names (WarrantVerifier.jsx is intentionally a static DIY-verification
> doc page); #6 partial — `search_claims` tool live, raw entity exposure deliberately omitted.
> Kept for history; do not build from this file.

> Hand this file to Claude Code (or any coding agent) to continue building.
> The app is a React + Tailwind + Base44 BaaS project. All backend logic lives in `base44/functions/` and `base44/shared/`.

---

## Current State (as of 2026-08-08)

### ✅ Completed
- **Tribunal pipeline** (`inquireTribunal`): 3-mode inquiry (single / fast-2-model / full-3-model tribunal) with cross-examination, reconciliation, cross-firm verification, red-team stress test, and warrant signing.
- **Attestation pipeline** (`attest.js`): Claim decomposition, source grounding (SSRF-guarded fetch + hash + tier matching), falsifier veto, coverage check, calibration, authoritative grounding penalty.
- **Claim-centric persistence** (`claimPersistence.js`): Every verified claim → discrete `Claim` + `EvidencePack` entity records, linked to their parent `Warrant` and `AnswerVersion`.
- **GitHub PR verification** (`githubPrVerify`): Diff parsing with file/line tracking, Aether Flash deterministic risk scan, policy evaluation, commit status posting, inline PR review annotations (`postPrReview`).
- **Claims Registry UI** (`/claims`): Browse, search, and filter all persisted claims with expandable evidence packs.
- **Hash-chained audit ledger** (`ledger.js`): Tamper-evident `AuditLog` with `previous_event_hash` + `event_hash` + Ed25519 `signature`.
- **LLM routing** (`llmRouter.js`, `anthropic.js`, `openrouter.js`): 3-tier fallback (Anthropic direct → OpenRouter → Base44 InvokeLLM) to minimize credit consumption.
- **Red-team arena, benchmark, leaderboard, calibration, drift alerts, key expiry guard, subscriber drip campaigns** — all wired and functional.

### 🔑 Anthropic API (Already Wired)
The app **already routes Claude model calls through your `ANTHROPIC_API_KEY`** secret, bypassing Base44 integration credits entirely. See:
- `base44/shared/anthropic.js` — direct Anthropic API client
- `base44/shared/llmRouter.js` — routes Claude models to Anthropic first, falls back to OpenRouter, then Base44

So Claude-based tribunal roles (proposer, verifier, falsifier, coverage) **work right now** without integration credits. Non-Claude models (GPT, Gemini) use OpenRouter (`OPENROUTER_API_KEY`) or Base44 InvokeLLM (blocked until credits reset 2026-09-04).

---

## Remaining Work

### 1. GitHub Connector Scope Upgrade
**Problem:** The authorized GitHub connector only has `repo:status` scope. PR review annotations require `pulls:write` scope, and auto-fetching PR diffs requires `pull_requests:read`.

**Tasks:**
- [ ] Re-authorize the GitHub connector with expanded scopes:
  - `repo:status` (have it)
  - `pull_requests:read` (need it — to auto-fetch PR diffs via API instead of manual paste)
  - `pulls:write` (need it — to post inline PR review annotations)
- [ ] In `githubPrVerify/entry.ts`, add auto-fetch path: when `diff_text` is NOT provided but `owner`/`repo`/`pull_number` are, fetch the diff via:
  ```
  GET https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}
  Accept: application/vnd.github.v3.diff
  ```
  using the connector access token from `base44.asServiceRole.connectors.getConnection('github')`.
- [ ] Update the `GitHubPrVerify.jsx` UI to support the auto-fetch mode (enter owner/repo/PR number → fetch diff automatically).

**Files to edit:**
- `base44/functions/githubPrVerify/entry.ts`
- `src/pages/GitHubPrVerify.jsx`

---

### 2. Ledger Integrity Check in Trust Center
**Problem:** The hash-chained `AuditLog` records have a `chain_integrity` boolean field, but there's no UI surface to verify the chain is intact (no tampering).

**Tasks:**
- [ ] Create a backend function `verifyLedgerIntegrity` that:
  - Loads AuditLog records for a tenant (or all), ordered by `created_date`.
  - For each record, recomputes `event_hash` from `event_type + entity_type + entity_id + actor_id + summary + metadata + previous_event_hash`.
  - Checks that each record's `previous_event_hash` matches the prior record's `event_hash`.
  - Checks the Ed25519 `signature` against `ED25519_PUBLIC_KEY`.
  - Returns: `{ total_events, verified, broken_count, broken_events: [{id, expected_hash, actual_hash}], signature_failures: [] }`.
- [ ] Add a "Ledger Integrity" card/section to the Trust Center page (`src/pages/TrustCenter.jsx` or `TrustCenterHub.jsx`):
  - Shows total events, verified count, broken count.
  - Button to re-run the integrity check.
  - Lists any broken chain links with details.

**Files to create/edit:**
- `base44/functions/verifyLedgerIntegrity/entry.ts` (new)
- `src/pages/TrustCenter.jsx` or `src/pages/TrustCenterHub.jsx` (edit — add integrity panel)

---

### 3. PR Verification UI Refinement
**Problem:** The `GitHubPrVerify.jsx` page works but could be more polished — needs better visual hierarchy for gate decisions, claim grouping by file, and a "copy as markdown" export for sharing results.

**Tasks:**
- [ ] Group claims by `file_path` in the results display (collapsible per-file sections).
- [ ] Add a prominent gate-decision banner at the top of results (BLOCKED / REQUIRES REVIEW / PASSED) with color coding.
- [ ] Add "Copy as Markdown" button that exports the full verification report as a markdown summary.
- [ ] Show the PR review annotation count and a link to the GitHub PR review (when `pr_review` is returned).

**Files to edit:**
- `src/pages/GitHubPrVerify.jsx`

---

### 4. Public Claims Browser (Public-Facing)
**Problem:** The `/claims` page is behind auth (ProtectedRoute). The "Public Truth" strategy calls for a public-facing claims browser so anyone can verify Aether's auditability.

**Tasks:**
- [ ] Create `src/pages/PublicClaims.jsx` — a read-only public version of the Claims page.
  - No auth required (public route in `App.jsx`).
  - Only shows claims where `tenant_id` is null or explicitly public (add a `is_public` flag to the Claim entity, or filter by `source_asset_type: 'pr_diff'`).
  - Shows claim text, verdict, evidence sources (with links), but redacts `tenant_id` and user-specific metadata.
- [ ] Add route `/public/claims` in `App.jsx` (outside ProtectedRoute).
- [ ] Add link in `PublicNav.jsx` under "Company" or a new "Transparency" group.

**Files to create/edit:**
- `src/pages/PublicClaims.jsx` (new)
- `src/App.jsx` (add public route)
- `src/components/sf2x/PublicNav.jsx` (add nav link)

---

### 5. Warrant Verification Endpoint (Public)
**Problem:** Stakeholders need a public way to verify a warrant's signature and integrity without logging in — enter the `signed_hash`, get back the full warrant + verification status.

**Tasks:**
- [ ] Create backend function `verifyWarrantPublic` that:
  - Accepts a `signed_hash` or `warrant_id`.
  - Loads the Warrant + its AnswerVersion.
  - Recomputes the signature using `ED25519_PUBLIC_KEY` and the same signing input (`[av.id, answer_text, premises.join(';;'), sources.join(';;')].join('|')`).
  - Returns: `{ warrant_id, validity_status, trust_score, signed_hash, signature_valid, premises, claims, sources, source_snapshots, created_date, expiry_date, answer_preview }`.
  - No auth required — public endpoint.
- [ ] Create `src/pages/WarrantVerifier.jsx` — the public warrant verification page:
  - Input field for signed_hash or warrant ID.
  - On submit, calls `verifyWarrantPublic`.
  - Displays: validity status badge, trust score, signature verification result, premises, claims breakdown, source snapshots with content hashes.
- [ ] Add route `/warrant-verifier` in `App.jsx` (public, outside ProtectedRoute) — **this route already exists in App.jsx**, just needs the page to be functional.

**Files to create/edit:**
- `base44/functions/verifyWarrantPublic/entry.ts` (new)
- `src/pages/WarrantVerifier.jsx` (edit — make it functional, currently may be a placeholder)

---

### 6. MCP Server Enhancement
**Problem:** The MCP server config exists (`base44/mcp/config.json`) but needs the Claims entity exposed as a tool so AI clients (ChatGPT, Claude) can query the claims registry.

**Tasks:**
- [ ] Add `Claim` and `EvidencePack` as exposed entities in `base44/mcp/config.json`.
- [ ] Add a custom MCP tool `search_claims` that accepts `{ text_query, category, verdict_status, risk_level }` and returns matching claims with evidence summaries.

**Files to edit:**
- `base44/mcp/config.json`

---

## Architecture Notes for Claude Code

### Key Shared Modules
| File | Purpose |
|------|---------|
| `base44/shared/sf2xCore.js` | Prompt building, trust calculation, Ed25519/HMAC signing |
| `base44/shared/attest.js` | Attestation pipeline — claim decomposition, source grounding, falsifier, calibration |
| `base44/shared/sf2xTribunal.js` | Multi-model tribunal — model routing, critique/reconcile/merge prompts, corroboration |
| `base44/shared/claimPersistence.js` | Bridges verification output → Claim + EvidencePack entities |
| `base44/shared/claimExtractor.js` | Deterministic claim extraction from text/diffs (sentence-based, no LLM needed) |
| `base44/shared/aetherFlash.js` | Deterministic risk scanner — regex-based, no LLM, zero credits |
| `base44/shared/llmRouter.js` | 3-tier LLM routing: Anthropic direct → OpenRouter → Base44 InvokeLLM |
| `base44/shared/anthropic.js` | Direct Anthropic API client (uses `ANTHROPIC_API_KEY` secret) |
| `base44/shared/openrouter.js` | OpenRouter API client (uses `OPENROUTER_API_KEY` secret) |
| `base44/shared/ledger.js` | Hash-chained audit log — `appendAudit()`, `verifyChain()` |
| `base44/shared/falsifier.js` | Adversarial falsifier + coverage check (Gate 2) |
| `base44/shared/redTeam.js` | Red-team attack simulator |
| `base44/shared/calibration.js` | Domain-aware trust calibration + empirical calibration from VerificationHistory |
| `base44/shared/authoritativeSources.js` | Domain → authoritative source registry (PubMed, SEC EDGAR, etc.) |
| `base44/shared/policyParser.js` | `.aether/policy.yml` parser → Policy entity |

### Entity Schema Locations
All entity schemas: `base44/entities/*.jsonc` — read them to understand field shapes before writing CRUD code.

### Frontend Conventions
- Pages in `src/pages/`, components in `src/components/`
- Use `@/` alias for imports (e.g., `import { base44 } from '@/api/base44Client'`)
- AppShell wraps authenticated pages: `import AppShell from '@/components/sf2x/AppShell'`
- PublicNav wraps public pages: `import PublicNav from '@/components/sf2x/PublicNav'`
- shadcn/ui components in `@/components/ui/`
- Icons from `lucide-react` only
- Tailwind classes as literal strings (no dynamic class construction)

### Backend Function Pattern
```typescript
// base44/functions/{functionName}/entry.ts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;
  // ... logic ...
  return Response.json({ result: '...' });
}
```

### Secrets Available
- `ANTHROPIC_API_KEY` — direct Anthropic API (Claude models, bypasses Base44 credits)
- `OPENROUTER_API_KEY` — OpenRouter (multi-model, bypasses Base44 credits)
- `ED25519_PRIVATE_KEY` / `ED25519_PUBLIC_KEY` — warrant signing
- `sf2x_attestation_key` — HMAC fallback for signatures
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — payments
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook verification
- `SF2X_API_KEY` — internal API key
- `SF2X_LLM_BUDGET` — monthly LLM budget gate
- `SF2X_SECURITY_THRESHOLD` — security claim threshold
- `SF2X_WORKFLOW_TOKEN` — workflow auth token

### Connectors
- **GitHub** (authorized, `repo:status` scope) — needs `pull_requests:read` + `pulls:write` for full PR verification
- **Google Sheets** (authorized) — used for audit/bench exports

### Credit-Saving Architecture
The entire LLM pipeline is designed to avoid Base44 integration credits:
1. Claude models → direct Anthropic API (0 credits)
2. Non-Claude models → OpenRouter (0 credits)
3. Deterministic checks (Aether Flash, claim extraction, policy evaluation) → no LLM at all (0 credits)
4. Base44 InvokeLLM is the LAST fallback, only used when both Anthropic and OpenRouter fail

### Build/Run
- `npm run dev` — Vite dev server
- `npm run build` — production build
- Backend functions are deployed automatically when `entry.ts` is saved
- Test backend functions with: `test_backend_function` tool or the dashboard "Test" tab

---

## Priority Order

1. **GitHub connector scope upgrade** (#1) — unblocks the full PR verification wedge
2. **Ledger integrity check** (#2) — completes the Trust Center trust story
3. **PR verification UI refinement** (#3) — polish for the wedge demo
4. **Warrant verification endpoint** (#5) — public-facing trust verification
5. **Public claims browser** (#4) — transparency play
6. **MCP server enhancement** (#6) — AI client integration

---

## Known Issues
- Integration credits exhausted until 2026-09-04 — Base44 InvokeLLM, SendEmail, UploadFile, etc. are blocked. Anthropic and OpenRouter API calls are unaffected.
- GitHub PR diff fetching currently requires manual `diff_text` input until scope is upgraded.
- The verifier is itself an LLM; it can be wrong or lack non-public knowledge (documented caveat attached to every warrant).
- Calibration thresholds are heuristic and domain-tuned.