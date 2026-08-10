# Aether Master Plan — Cross-Reference Synthesis

**Date:** 2026-08-10 · **Session:** aether-sf2x-plan-review
**Inputs cross-referenced:**

| # | Source | Shorthand |
|---|---|---|
| 1 | "AETHER / SF2X — FULL BUILD PLAN v4.0" (governance constitution: epistemic rules, canonical objects, policy packs, capability cards, incidents, ops) | **Plan A** |
| 2 | "Aether + SF2X: Truth, Forge, and Accountability Build Plan" (product spine: Five Acts, Forge 4D, warrant schema, extension hardening, 11 phases, 90 days) | **Plan B** |
| 3 | Shipped reality — `aether-sf2x` repo `main` (Action, SDKs, MCP worker, extensions, docs) + `aether-app-import` branch (`app/` Base44 source, `REMAINING_BUILD_PLAN.md` 2026-08-08) | **Reality** |
| 4 | `D:\SF2X` — Living Cosmos engine, ratified positioning (`SF2X_PHASE_STATE.json` 2026-07-23), crystal-vs-RAG receipts, 8-field doctrine | **SF2X** |

Evidence labels: everything under "Reality" and "SF2X" below is repo/file evidence read this session; conflict resolutions are recommendations (marked); the rest is analysis.

---

## 1. Verdict

**Neither plan alone; both merged, grounded in Reality, will make Aether materially better.**

- **Plan A** is the *law*: the epistemic constitution, typed object model, policy-pack anatomy, capability cards, incident/correction machinery, ops doctrine, privacy/exit guarantees. It is weakest on product experience, concrete crypto, and it is written greenfield — it puts the MCP server and extension in Phase 7 when both are **already shipped**.
- **Plan B** is the *product*: audit-first phasing, concrete warrant schema (RFC 8785 / SHA-256 / Ed25519 / KMS / transparency log), semantic-diff anti-laundering, independence analysis, extension hardening, contract-break UX, Forge Work/Infinity modes, a real 90-day schedule. It is weakest on typed contracts, incident/ops depth, capability disclosure, and exit/portability.
- **Both** miss the same six things (Section 5) — the biggest being verification reuse/memoization and unit economics, which the shipped product's own history proves matter (14.2 s per verify in the live docs example; the batchVerify 50× cost incident; LLM credits exhausted until 2026-09-04).
- **Both** are greenfield-blind: roughly a third of what they schedule already exists in some form (tribunal, attest pipeline, claim persistence, Ed25519 hash-chained ledger, PR verify with `.aether/policy.yml` parser, Action, SDKs, OAuth MCP worker, extensions, red-team arena, calibration, drift alerts). The merge must be re-cut against the gap register (Section 6), not either plan's phase list.

---

## 2. Conflicts to resolve (decision items)

**C1 — What "SF2X" means.** Plan A: the epistemic substrate. Plan B: the public experience layer. Reality/SF2X: positioning ratified 2026-07-23 — *"SF2X is the truth-native memory engine rented via MCP; verticals are tenants on the rail."*
**Recommendation:** follow the ratified positioning. SF2X = platform brand + truth substrate. **Aether = the accountability product (a vertical tenant of the rail, like Creator).** Airlock/Cosmos/Forge/Studio/Bridge = experience surfaces of the Aether product. Plan B's table stays, relabeled; Plan A's "SF2X plane" becomes "the substrate interface" (see C7).

**C2 — First vertical.** Plan A: `technical-docs@1.0` (README/docs/PR gate). Plan B: mechanical/field (manuals, bulletins, torque specs).
**Recommendation:** technical-docs first — it is the shipped wedge (`githubPrVerify`, `policyParser.js` for `.aether/policy.yml`, commit status, inline PR annotations, the Action, both SDKs all exist). Mechanical becomes `mechanical@1.0`, the **Forge Work Mode pilot pack**, phase-gated exactly where Plan B puts Forge. Both verticals survive; only the order is decided.

**C3 — Phasing spine.** Plan A has 8 greenfield phases; Plan B has 11 phases **including Phase 1 = audit current implementation + gap register**, plus a 90-day schedule.
**Recommendation:** Plan B's spine wins (audit-first is the correction both need), with Plan A's per-phase exit criteria grafted on, and the whole thing re-cut by Section 6's gap register. Section 7 is the rebased 90 days.

**C4 — Warrant schema.** Plan A lists warrant contents prose-style; Plan B ships `AetherWarrantV1` with named algorithms and `model_provenance_hash` / `protocol_version` / `policy_snapshot_hash` (which Plan A's warrant *lacks* — its own §17.2 capability gate is unenforceable without them).
**Recommendation:** Plan B's schema is canonical. Graft from Plan A + this review: `capability_card_id`, review/dissent record refs, decision-owner id, service-mode-at-issuance, and add **`integrity_under_review`** to the status enum (both plans reference a key-compromise runbook state that neither lifecycle contains).

**C5 — The trust score.** The live product IS the thing both plans reject: a single 0–100 score with verified/contested/rejected, and the Action gates on `threshold: 85`.
**Recommendation:** keep `trust_score` in API v1 as a *display/summary* signal (SDKs, Action, extension depend on it today); introduce API v2 with Plan B's verdict enum + per-dimension outputs; deprecation window; Action v2 consumes claim-level dispositions in **advisory mode by default** until a capability card exists for the pack (Plan A §17 logic, applied symmetrically to blocking — see H12). *Timing is Cam's call.*

**C6 — Economy.** Plan A: assertion budgets + typed reputation. Plan B: four-behavior separation (good-faith / honest error / negligence / deception), control ladder, accountability bonds, closed-loop credits.
**Recommendation:** merge — B's behavior separation and ladder as the frame, A's typed interfaces as the contracts. **Bonds never apply to the dev/CI wedge** (developers will not post bonds to merge PRs — it would kill the wedge); bonds are for public high-reach publishing only. Nothing transferable, no tokens — both plans and SF2X doctrine agree.

**C7 — Who owns Forge, and where does the substrate live.** Plan B's Forge/Infinity Machine is the same vision as SF2X ladder phases 9–11 (Disassembly Engine / Concept Forge / 4D Interface — all currently `blocked` in `SF2X_PHASE_STATE.json`), and the ecosystem CLAUDE.md's "4D Dissembly and Invention Viewer."
**Recommendation:** one owner per layer — **product surface in aether-sf2x** (Work Mode first, per both plans), **engine work in D:\SF2X ladder order**; do not parallel-build the engine. Likewise the substrate: **Base44 stays the operational store now** (it works, it ships), but the merged plan defines Plan A §4's canonical objects as the *substrate interface*, so migrating canonical stores to the SF2X rail (Supabase/pgvector, once rent-rail lands: keys → metering → tenancy) is a storage swap, not a rewrite. *Migration timing is Cam's call; the interface is not.*

---

## 3. What Plan B adds to Plan A (adopt into the merge)

1. **Semantic diff + anti-scope-laundering** — the display-eligibility formula (`content_hash + claim_range + context_hash + scope_version + policy_version + warrant_status + freshness_status`), warrant detaches on material edit, and **composition warrants** (warranted claims don't auto-warrant a synthesized conclusion). Plan A binds warrants to artifact hash and stops; it has no presentation-layer defense at all.
2. **Independence analysis** — citation count ≠ corroboration; syndication/citation-loop/shared-dataset detection; independence clusters; `independence_graph_hash` in the warrant. Absent from Plan A's evidence fabric *and* its 28 benchmark families.
3. **Extension hardening** — the failure/control table (mutation invalidation, versioned adapter registry, origin allowlist, consent/redaction, cache-poisoning keys, TTL) + the extension state machine. Plan A doesn't treat the extension despite it being shipped and just repaired.
4. **Concrete cryptography** — RFC 8785 canonicalization, SHA-256, Ed25519 in KMS/HSM, signed key-discovery endpoint (`/.well-known/aether-keys.json`), Merkle transparency log with signed checkpoints + inclusion proofs.
5. **Decision resolver ladder** — the ordered deterministic resolution (BLOCKED → OUT_OF_SCOPE → CONTRADICTED → NOT_SUPPORTED → NEEDS_REVIEW → SUPPORTED_WITH_LIMITS → VERIFIED_FOR_STATED_USE). Plan A only defines the `supported` predicate.
6. **Bounded-use verdicts** — `verified_for_stated_use` + `permitted_use[]` / `prohibited_use[]` on the warrant.
7. **Contract-break UX** — the trigger/state/action/CTA table, the contract-break sheet, "never green for stale," plain-language-first.
8. **Audit-first phasing + First 90 Days** — Phase 1 gap register (Implemented/Partial/Missing/Unsafe/Deprecated) and a dated schedule.
9. **Concrete API contract** — `/v1/*` endpoints incl. `/warrants/{id}/dependents`, `/proof`, challenges, webhooks, key discovery (to be reconciled with the live `verifyResponse`/`batchVerify`/`webhookVerify`/`warrantApi` — see H7).
10. **Airlock** — guest-first, low-friction intake (paste/URL/screenshot/voice). Plan A has no acquisition surface.
11. **Drift indicators → actions** and the 5-level circuit-breaker ladder (Plan A has boundaries + service modes; B supplies the tripwires).
12. **Four-behavior accountability + quorum table + reviewer role may/may-not matrix.**

## 4. What Plan A adds to Plan B (adopt into the merge)

1. **Capability cards + capability gate** (§17) — per-domain validated-limits disclosure; no automatic high-risk decisions outside the evaluated range. B's release gates are global; A's cards are per-pack and versioned. (Graft `capability_card_id` into B's warrant schema.)
2. **Structured applicability assessment** (§6.4) — subject/population/jurisdiction/time/version/condition per evidence-claim pair. B scores applicability as one number.
3. **Canonical object registry + ID/audit rules** (§4) — the full typed inventory and immutability rules; this becomes the substrate interface (C7).
4. **Policy-pack anatomy + change control** (§9) — replay against historical warrants, adversarial review, shadow execution, staged rollout, rollback; "a policy change cannot silently alter historical warrants."
5. **Incident machinery** (§12) — incident taxonomy, correction loop, regression-fixture pipeline, correction-debt formula (cap the age term so accepted-risk items don't grow forever).
6. **Unknown-unknown program + metric** (§18.4).
7. **28 benchmark failure families** (§18.2) — merge with B's frozen corpus; add `independence_failure` (B's concept, neither list has it).
8. **Dependency doctrine + SLOs + DR** (§24) — per-dependency safe behavior table; tenant export tested as an operational procedure.
9. **Privacy, sovereignty, portability, decommissioning** (§15, §26) — offline verifier survives retirement; deletion honesty ("state exactly what remains and why").
10. **Rights/fairness/power controls** (§25) — disparate review-burden monitoring; epistemic signal ≠ employment discipline.
11. **Review-packet contents + separation-of-duties rules** (§10).
12. **Repo policy YAML** (§22.1) — with fixes: add `materiality_rules` (deterministic floors by path/pattern — e.g. anything in SECURITY.md ≥ high), per-source-class freshness (a versioned spec doesn't stale in 90 days; news does), `manual_review_fallback` for degraded modes, changed-files-only scoping, per-PR claim-count caps. **Align with the shipped `policyParser.js` schema or version it explicitly — read that file before freezing the format.**
13. **Ship/no-ship gates** (§28) and the non-goals list (§1.3).

---

## 5. Holes in BOTH plans (new sections the merged plan needs)

**H1 — Verification reuse / memoization.** Neither plan says when a verdict may be *reused*. Without it, every PR re-verifies every claim through a ~14 s/claim tribunal (measured: `latency_ms: 14255` in the live API docs) and the CI wedge dies of latency and cost. Add: claim-verdict cache keyed on `claim_hash + evidence_snapshot_set_hash + policy_version + protocol_version + capability-card range`; unchanged key → reuse without human re-review; any component change → invalidate (this is B's extension cache-key formula, generalized into the core engine). Delta-verification on rebase falls out of the same key.

**H2 — Claim-extraction recall program.** The whole system is sound only over claims it *extracts*; a missed material claim silently passes. The shipped `claimExtractor.js` is sentence-based/deterministic — it will miss compound, implicit, and cross-sentence claims. Add: dual-path extraction (deterministic + model) with disagreement sampling; author claim annotations as an escape hatch; "claims added by humans post-hoc" tracked as the compiler-miss signal; extraction recall measured in the benchmark, not assumed.

**H3 — Unit economics & cost control.** Both plans wave at budgets; Reality already paid the tuition: batchVerify shipped with a 50× per-request metering hole (fixed in `mcp-worker/src/batchQuota.js`, **still unconfirmed upstream**), Base44 integration credits exhausted until 2026-09-04, and the 3-tier `llmRouter` exists purely to dodge credit burn. Add: meter per *claim/text* not per request (port the batchQuota fix server-side); per-tenant/per-mission/per-PR budgets; cost circuit breakers; cost-per-verification as a tracked SLO next to Plan A's "cost per prevented material failure."

**H4 — Latency budgets + tiered pipeline.** Add explicit targets and the ladder: deterministic pre-pass (`aetherFlash.js` — exists, zero-cost) → memoized verdicts (H1) → full tribunal only for new/material claims; async PR-check UX for the tail. Without stated budgets, "verification latency by risk tier" (Plan A) is an empty SLO.

**H5 — Evidence aggregation semantics.** What happens when one snapshot entails and another contradicts? Add deterministic rules: controlling authority defeats lower tiers; equal-tier conflict → `contested`/`needs_review`; corroboration weighted by *independence cluster* (B) not count; and define the numeric `authorityTier` per pack (Plan A's 0–4 vs its own 6-level technical-docs hierarchy never map — make tiers pack-scoped).

**H6 — Review operations.** Quorums exist (B), SLAs don't. Add: review SLAs per risk tier, escalation path, and the deadlock rule — what a `review_required` PR does after N days (per-tier: auto-expire to advisory for `high`, stay blocked for `critical`). Plus batch review for many-similar claims, with per-claim records preserved.

**H7 — Platform risk + API migration.** A trust layer whose backend flapped 404/500/401 in one day (documented 2026-08-09 in `docs/API_REFERENCE.md`) and whose credits exhaust cannot sign availability SLOs. Add: Base44 risk register + exit criteria (the nightly export exists — formalize it as the lifeboat; C7 defines the substrate interface for the eventual move). And an explicit **API v1→v2 migration**: SDKs, Action, and extension are live on v1 semantics; v2 (B's endpoints + verdict enum) needs a compat window, not a cutover. Include the **signing migration**: the current signing input (`[id, answer_text, premises.join(';;'), sources.join(';;')].join('|')`) is delimiter-ambiguous — a `|` or `;;` inside content forges collisions; migrate to RFC 8785 canonical JSON with a dual-sign window so old warrants stay verifiable.

**H8 — Cold-start source curation.** Who builds a tenant's registry + authority tiers + stewards on day one? Seed exists (`authoritativeSources.js`); add the onboarding workflow: auto-propose registry from repo/domain links, steward assignment, "quarantined until curated" default.

**H9 — Revalidation storm control.** A popular source changes → thousands of dependent warrants. Add priority classes (critical first), batching, and lazy-by-expiry for low tiers; both plans have cascade SLOs but no scheduling policy.

**H10 — Dogfooding + marketing under the plan's own law.** Aether's own README/docs must pass Aether in CI (the repo's own history is the proof case: "fix endpoint docs" post-deploy commit). And the README's **"AUC 1.0 · Perfect separation · 91/100 vs 14/100"** currently violates both plans' marketing rule — publish n + methodology beside the numbers or narrow the claim, exactly as SF2X did ("NARROW THE CLAIM," locked benchmark rule: *do not claim wins beyond measured advantages*).

**H11 — Vulnerability disclosure.** Both plans require a VDP; `app/SECURITY.md` is an unfilled GitHub template. Write the real one (contact, scope, SLA, safe harbor).

**H12 — Injection indicators must gate verdicts, symmetrically.** Plan A defines `injectionIndicatorsDetected` but its own deterministic gate never consumes it; B isolates injected content but the resolver never references it. Add to the resolver: indicators present → favorable verdicts unreachable (cap at `needs_review`). And apply capability gating **symmetrically to blocking**: no default hard-block in CI without a measured false-block rate for the pack (over-blocking kills adoption exactly like SF2X's measured over-silencing — false-silence 72.2% on KNOWN — kills answerability).

---

## 6. First-cut gap register (Reality vs the merged plan)

**Implemented** (evidence: `REMAINING_BUILD_PLAN.md` 2026-08-08, repo `main`, live-probed docs 2026-08-09):
tribunal (3-mode, cross-exam, red-team, warrant signing) · attest pipeline (decomposition, SSRF-guarded grounding + hash + tier matching, falsifier veto, coverage, calibration) · claim persistence (Claim + EvidencePack entities) + `/claims` UI · hash-chained Ed25519 audit ledger · `githubPrVerify` (diff parse, Flash risk scan, policy eval, commit status, inline annotations) + `.aether/policy.yml` parser · Action v1 (score-threshold) · Python/JS SDKs · MCP worker (OAuth 2.1, SSE, SSRF guard, batch quota) · Chrome + desktop extensions · Claude skill · Slack/Teams alerting · red-team arena, benchmark, leaderboard, calibration, drift alerts · Stripe tiers · nightly backup (0-record tripwire) · multi-model compare matrix.

**Partial:** warrants (signed, but weak canonicalization — H7; no Merkle log / inclusion proofs / key-discovery endpoint) · public verification (`warrantApi` live; `verifyWarrantPublic` + `WarrantVerifier` page pending) · public claims browser (pending) · GitHub connector (`repo:status` only; needs `pull_requests:read` + `pulls:write`) · MCP claims tools (pending) · ledger-integrity endpoint/UI (pending) · extension content-binding/mutation hardening (**unverified** against B's table — needs adversarial fixtures).

**Missing:** evidence vault with snapshots-as-first-class + locators + structured applicability · policy packs as versioned artifacts + change control · capability cards · semantic diff / display eligibility · independence analysis · research missions · Forge (all) · Cosmos product surface · review workflow/quorum/dissent · incident taxonomy + regression fixtures · drift breakers wired to service modes · SLOs/DR formalized · decommissioning/export guarantees · reputation/credits · **everything in Section 5**.

**Unsafe / at-risk:** batchVerify per-text metering upstream (worker fixed; server-side unconfirmed) · `webhookVerify` SSRF validation unverified server-side (`ssrf.js` exists in the worker; reuse it) · signing-input delimiter ambiguity (H7) · `SECURITY.md` placeholder (H11) · README benchmark overclaim (H10) · **`aether-app-import` branch unmerged** — the app source and the distribution repo are divergent lines; land it (or decide the repo split) before the gap register can live in one tree.

---

## 7. Rebased First 90 Days (replaces both plans' schedules)

**Days 1–15 — Truth about ourselves.**
Land/decide `aether-app-import` → `main` · adversarial verification pass on the Unsafe list (extension binding fixtures, server-side SSRF, server-side batch metering) · freeze the merged warrant contract (C4) and vocabulary · GitHub connector scope upgrade (existing task #1) · ledger-integrity endpoint + Trust Center panel (task #2) · real `SECURITY.md` · README claim-narrowing (H10).

**Days 16–35 — Verifiable to outsiders.**
RFC 8785 dual-sign migration (H7) · `/.well-known/aether-keys.json` · `verifyWarrantPublic` + proof page (task #5) · public claims browser (task #4) · claim-verdict cache v1 (H1) · Flash-first tiered pipeline with stated latency budgets (H4) · API v2 contract draft mapping B's endpoints over the live functions (H7).

**Days 36–60 — The wedge becomes the product.**
Evidence snapshots + locators + applicability v1 on the PR path · decision resolver replaces the raw score gate; **Action v2 ships advisory-by-default** (C5, H12) · `technical-docs@1.0` formalized over `policyParser.js` (A §22.1 + fixes) · review workflow v1 (low/medium quorums, SLAs — H6) · transparency log v1 (the hash-chained ledger upgrades naturally to Merkle checkpoints).

**Days 61–90 — Defensible.**
Independence analysis v1 (B) · semantic-diff / display eligibility on proof pages + extension (B) · capability card v1 for technical-docs; enforcement (blocking) unlocks only with measured false-block rate (H12) · drift indicators + breaker levels wired to service modes · mission workspace skeleton · Forge Work Mode starts **only after** wedge metrics justify it (both plans agree; C7 governs ownership).

---

## 8. Immediate corrections (this week, independent of any plan decision)

1. Confirm/port per-text batch metering upstream (the 50× hole) — `batchQuota.js` is written and tested.
2. Verify `webhookVerify` SSRF guard server-side — `ssrf.js` is written; don't write it twice.
3. Replace `SECURITY.md` boilerplate.
4. Put n + methodology next to the README benchmark table, or narrow the claim.
5. Land or explicitly fork `aether-app-import`.
6. GitHub connector scopes (unblocks the wedge; already task #1 in `REMAINING_BUILD_PLAN.md`).

---

## 9. D:\SF2X reconciliation notes

- **Positioning (ratified 2026-07-23):** SF2X rents truth-memory via MCP; tenants on the rail. Aether slots in as a vertical tenant; its substrate interface (Plan A §4) is the future seam to the rail once keys/metering/tenancy land. Base44 remains operational until then (C7).
- **Forge:** same vision as SF2X ladder 9–11 (blocked). Product surface here, engine there, ladder order respected — no parallel build.
- **Discipline transfers:** the locked benchmark rule (*claim only measured advantages*) governs Aether marketing (H10); the over-silencing lesson (false-silence 72.2% on KNOWN) is the false-block warning for the CI gate (H12); signed receipts at 100% in crystal-vs-RAG runs are the existence proof that the warrant discipline works end-to-end.
- **Doctrine:** 8-field is an optional metadata lens in Aether (domain-neutral product); no 5-element drift; lightning is a force; CFX does not exist. Both plans are already clean on naming.

---

## 10. Producing MASTER_PLAN v5.0

Mechanics once the C1–C7 recommendations are confirmed (or amended):
Plan B's document is the base spine → graft the Plan A sections listed in §4 → insert §5's H1–H12 as first-class sections → replace both phase lists with §6's gap register + §7's 90 days → carry §9's doctrine notes in the preamble. One document, one owner per layer, no greenfield fiction.
