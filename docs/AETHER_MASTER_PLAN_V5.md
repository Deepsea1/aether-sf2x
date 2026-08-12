# AETHER — MASTER BUILD PLAN v5.0

**Status:** Canonical merged plan — supersedes "AETHER / SF2X — FULL BUILD PLAN v4.0" (Plan A) and "Aether + SF2X: Truth, Forge, and Accountability Build Plan" (Plan B).
**Product:** Aether — the accountability layer for consequential AI-assisted work.
**Platform:** SF2X (the truth-native memory rail; Aether is a vertical tenant — positioning ratified 2026-07-23).
**Surfaces:** Airlock · Cosmos · Forge · Studio · Bridge.
**First domain pack:** `technical-docs@1.0` (the shipped PR-gate wedge). **Second:** `mechanical@1.0` (the Forge Work Mode pilot).
**Provenance:** merged per `docs/AETHER_MASTER_PLAN_SYNTHESIS.md`; conflict decisions C1–C7 ratified by Cam 2026-08-10. Grounded in shipped reality (repo `main` + `aether-app-import`, live API probes 2026-08-09) — this plan contains **no greenfield fiction**: Section 28 is the gap register it is cut against.

---

## 0. How to read this plan

- Plan B supplied the document spine (product, phasing, crypto, UX). Plan A supplied the law (constitution, typed objects, policy anatomy, capability cards, incidents, ops, exit). Sections marked **[NEW]** existed in neither plan — they close the twelve holes (H1–H12) both plans shared.
- Evidence discipline applies to the plan itself: statements about the current system cite files or probes; targets are labeled targets; nothing here claims "working" without evidence (SF2X truth law).
- Naming law: **SF2X** in this document = the platform brand + truth-memory rail. **Aether** = this product. CFX does not exist. The 8-field model (4 elements + 4 forces) is an optional metadata lens in Aether — never a 5-element frame, and never required for domain-neutral tenants.

---

## 1. Mission, promise, honest limit, non-goals

### 1.1 Mission

Build the accountability layer for consequential AI-assisted work. Aether evaluates material claims in a specific artifact against preserved evidence, applies a declared policy, records accountable human decisions, and produces a signed warrant that can be independently verified — at a latency and cost that make the safe path the fast path.

### 1.2 Core promise

> AI can generate an answer. Aether makes consequential claims accountable.
> Aether does not promise AI will never be wrong. It makes consequential AI claims difficult to be wrong **silently**.

### 1.3 Honest limit

Aether does not determine universal truth. For an explicitly scoped artifact and policy it determines: what was claimed; what evidence was inspected; whether that evidence is authorized, current, independent, and applicable; what supports, qualifies, or contradicts the claim; what remains unknown; whether policy permits release; who accepted residual risk; and what changes would invalidate the decision.

### 1.4 Non-goals

Aether is not: a universal truth oracle · a generic chat interface · a citation formatter · **a single confidence score** · a RAG replacement · a guarantee of legal/medical/financial/regulatory correctness · an autonomous authority over people · a surveillance or employee-ranking system · a decorative graph product · a speculative token economy · a system that lets models approve their own output.

---

## 2. Positioning and product architecture

### 2.1 The stack (decision C1/C7)

```text
SF2X RAIL (D:\SF2X — Living Cosmos engine)
  truth-native memory: source · confidence · correction · contradiction · decay ·
  evidence trail · signed receipts — rented via MCP; tenants on top
        ▲  (future seam: the Substrate Interface, §4 — storage swap, not rewrite)
        │
AETHER (this product — a vertical tenant of the rail; Base44 is the operational
store today)
  Verify → research → warrant → challenge → monitor → govern
        │
SURFACES (the five acts)
  Airlock — ask, paste, upload, speak            (low-friction truth entry)
  Cosmos  — relationships, history, blast radius (knowledge & dependency graph)
  Forge   — take anything apart, find frontier   (4D disassembly & invention)
  Studio  — explain or publish a bounded result  (proof artifacts)
  Bridge  — control risk at scale                (policy decision point & ops)
```

**Forge ownership (C7):** one vision, two layers. The product **surface** (Work Mode, later Infinity Mode) lives in aether-sf2x. The **engine** (Disassembly / Concept Forge / 4D Interface) is SF2X ladder phases 9–11 and is built there, in ladder order. No parallel engine build.

### 2.2 Boundary table — what each part must not become

| Layer | Responsibility | Must not become |
|---|---|---|
| Aether core | Claim-level verification, policy enforcement, warrants, review, release controls | A vague AI "trust score" |
| SF2X rail / substrate | Evidence vault, lineage, permissions, event ledger, revalidation, correction economy | A hidden black-box memory store |
| Airlock | Guest-first intake | A chat product |
| Cosmos | Evidence/conflict/change/impact/ownership/unknowns navigation | A graph dump or 3D demo |
| Forge | Governed disassembly, inquiry, repair, experiment, invention | An unbounded hallucination engine |
| Studio | Governed publication of artifacts and decisions | A bypass around verification |
| Bridge | Policy decision point, integration, source movement | An ungoverned data pipe or retrospective dashboard |

---

## 3. Epistemic constitution

### 3.1 Binding rules (merged A§3.1 + B's contract)

1. Preserve original evidence, permissions, version, source identity, and retrieval time.
2. Separate observations, assertions, evidence-supported inferences, hypotheses, decisions, and opinions.
3. Require exact evidence links and locators for material verified claims.
4. Evaluate applicability: a real source can still be irrelevant to a specific claim.
5. Search for relevant contradiction where policy requires it.
6. Never interpret missing evidence as positive support. Unknown remains unknown.
7. Evidence is not model output: models may extract, compare, or propose; preserved evidence and policy determine decisions.
8. Never promote a Forge hypothesis into supported knowledge automatically.
9. Never let a model issue a final release decision.
10. Bind an active warrant to a specific immutable artifact hash, policy version, protocol version, and model provenance.
11. Revalidate when source, policy, model/rule behavior, access, or dependency changes.
12. Every favorable result is reversible: challenge, drift, expiry, policy change, scope change, and new evidence can narrow, supersede, or revoke it.
13. **No scope laundering:** a warrant for a narrow conditional claim cannot be displayed beside a broader edited statement (§20).
14. Preserve material dissent and accountable overrides.
15. Make correction durable through regression tests and affected-warrant revalidation.
16. Fail closed for critical actions; fail visibly for all other degraded states.
17. Keep customers in control of data, portability, keys, and verification.
18. Market only what benchmarked evidence demonstrates — including about Aether itself (§19.6).
19. 3D is optional: every critical action exists in 2D Work Mode.
20. Human review is mandatory where policy says so; no automation bypasses it through a different route or UI.

### 3.2 The reconciled state model **[NEW — fixes the A/B state mismatch]**

Four distinct state machines. No aggregate may conceal a failure in any dimension (integrity / evidence / applicability / authority / policy / decision).

```ts
// 1. Verdict of one verification run, per claim (the resolver's output, §8)
export type ClaimVerdict =
  | "verified_for_stated_use"
  | "supported_with_limits"
  | "needs_review"
  | "not_supported"
  | "contradicted"
  | "out_of_scope"
  | "blocked"
  | "unknown";              // honest abstention — never silent

// 2. Epistemic lifecycle of a claim object (knowledge over time)
export type ClaimState =
  | "observed" | "asserted"
  | "supported" | "supported_with_qualifications"
  | "contradicted" | "unknown" | "out_of_scope"
  | "decided" | "superseded" | "expired" | "retracted" | "revoked";

// 3. Forge namespace — quarantined; can NEVER appear as a ClaimState
export type ForgeState =
  | "hypothesized" | "experiment_planned" | "experimented"
  | "promoted" | "abandoned";

// 4. Warrant status (§9.4)
export type WarrantStatus =
  | "draft" | "evaluating" | "review_required"
  | "issued_active" | "challenged" | "stale" | "revalidating"
  | "superseded" | "expired" | "revoked"
  | "integrity_under_review";   // [NEW] — the key-compromise runbook state
```

**Verdict → display mapping** (Plan B's truth-state UI, made deterministic):

| ClaimVerdict | Display state | Treatment |
|---|---|---|
| verified_for_stated_use | Sourced | Green — with stated use, scope, expiry |
| supported_with_limits | Sourced, qualified | Green with visible limits; limits are not removable in Studio |
| needs_review | Insufficient / pending | Gray — never favorable |
| not_supported | Insufficient | Gray |
| contradicted | Contested | Amber, with the conflicting evidence one click away |
| out_of_scope | Out of scope | Neutral |
| blocked | Unsafe/blocked | Red / lock |
| unknown | Unknown | Gray — explicitly honest silence, never an error style |

Inference chains display as **Inferred** (blue, chain visible); Forge objects display as **Hypothesized** (violet, translucent) and are namespaced, styled, stored, and retrieved separately (§21.4). Superseded results fade with lineage visible. **Never green for stale, invalidated, superseded, or disputed results.**

---

## 4. Canonical objects and the Substrate Interface

Every cross-product object has a durable, globally unique, immutable ID. This registry is the **Substrate Interface**: Base44 implements it today; the SF2X rail can implement it later (keys → metering → tenancy, per the ratified build order). Migration is a storage swap, not a rewrite (decision C7).

```text
tenant · principal · role · permission_grant
source · source_snapshot · evidence_span · evidence_relation
artifact · verification_run · claim · applicability_assessment
verdict_reuse_record            [NEW — §7]
policy_pack · policy_decision
warrant · warrant_event · review · dissent · decision_record · override
challenge · incident · correction · regression_fixture
dependency_edge · revalidation_job
cosmos_node · cosmos_edge
forge_mission · hypothesis · experiment · experiment_result
publication · transparency_log_entry
capability_card · verifier_release   [NEW — pins model/rule versions]
assertion_budget · domain_reputation
service_mode_event              [NEW — every mode transition is an event]
cost_event                      [NEW — §7.3 metering unit]
```

Identity rules: IDs are never reused; labels may change, IDs may not; cross-tenant IDs reveal nothing about the tenant; every mutation is an immutable audit event; facts, snapshots, decisions, and warrants are never overwritten — corrections, revocations, and supersessions reference prior IDs; every export carries schema version + canonicalization version.

**Mapping to shipped entities:** `Claim`, `EvidencePack`, `Warrant`, `AnswerVersion`, `AuditLog`, `VerificationHistory`, `Policy`, `ApiUsage` exist in `app/base44/entities/`. The gap register (§28) lists which interface objects they already satisfy, partially satisfy, or miss. New code builds toward this registry; existing entities are extended, not parallel-built.

---

## 5. Evidence fabric

### 5.1 Source classes (A§6.1)

```ts
export type SourceClass =
  | "internal_authoritative" | "internal_reference"
  | "official_primary" | "regulator_or_standard"
  | "peer_reviewed_research" | "vendor_documentation"
  | "public_record" | "news_or_secondary"
  | "community_content" | "unverified_user_submission";
```

### 5.2 Source snapshots

```ts
export interface SourceSnapshot {
  sourceSnapshotId: string;
  sourceId: string;
  tenantId?: string;
  canonicalUri: string;
  sourceClass: SourceClass;
  authorityTier: number;          // pack-scoped — see §5.5; 0 = most controlling
  ownerOrPublisher?: string;
  retrievedAt: string;
  publishedAt?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  contentHash: `sha256:${string}`;
  mediaType: string;
  snapshotStorageRef: string;     // content-addressed; verifier re-hashes on read
  parserVersion: string;
  accessPolicyId: string;
  independenceClusterId?: string; // §5.6
  ingestionStatus: "accepted" | "quarantined" | "rejected" | "superseded";
}
```

A source URL is not evidence without a preserved snapshot. Embeddings support discovery; snapshots and locators support evidence.

### 5.3 Evidence relations

```ts
export interface EvidenceRelation {
  evidenceRelationId: string;
  claimId: string;
  sourceSnapshotId: string;
  relation: "entails" | "partially_entails" | "contradicts" | "qualifies" | "context_only";
  exactQuote: string;             // stays in access-controlled bundles; warrants carry hashes/IDs only
  locator: {
    type: "page" | "section" | "paragraph" | "table_cell" | "json_path" | "line_range";
    value: string;
  };
  checks: {                       // uniform polarity: true = safe [fixes A's inverted flag]
    quotePresentInSnapshot: boolean;
    allowedByPolicy: boolean;
    sourceFreshEnough: boolean;
    authoritySufficient: boolean;
    scopeCompatible: boolean;
    noInjectionIndicators: boolean;   // consumed by the resolver — §8.2 [NEW]
  };
  directness: "primary" | "secondary" | "syndicated" | "ai_summary";  // [from B]
  assessedAt: string;
  assessmentMethod: "deterministic" | "model_assisted" | "human_reviewed";
}
```

### 5.4 Applicability is mandatory for material claims (A§6.4)

```ts
export interface ApplicabilityAssessment {
  claimId: string;
  sourceSnapshotId: string;
  subjectMatch: "yes" | "partial" | "no" | "unknown";
  populationMatch: "yes" | "partial" | "no" | "unknown";
  jurisdictionMatch: "yes" | "partial" | "no" | "unknown";
  timeMatch: "yes" | "partial" | "no" | "unknown";
  versionMatch: "yes" | "partial" | "no" | "unknown";
  conditionMatch: "yes" | "partial" | "no" | "unknown";
  result: "applicable" | "partially_applicable" | "not_applicable" | "undetermined";
  rationale: string;
}
```

### 5.5 Authority tiers are pack-scoped **[NEW — fixes A's 0–4 vs 6-level mismatch]**

`authorityTier` is an integer defined **by the domain pack**, 0 = most controlling, larger = weaker. Each pack publishes its ladder (e.g. technical-docs@1.0 maps its 6 levels to tiers 0–5, §11.2). Cross-pack tier comparison is undefined and forbidden — tiers only mean something under the pack that defined them.

### 5.6 Independence analysis (from B — required, not optional)

Citation count is not corroboration. Every material claim's evidence set is clustered by origin:

```text
Evidence items: 7 → independent origins: 2 · primary observations: 1
                    syndicated copies: 4 · indirect summaries: 2
```

Detect or escalate: shared origins · duplicated language · citation loops · shared datasets · shared incentives · coordinated behavior · source compromise · retractions · AI summaries without inspectable primary sources. Corroboration is counted **per independence cluster** (§8.3). The cluster graph hash is bound into the warrant (§9.2).

### 5.7 Evidence anti-corruption rules

Retrieval results are untrusted **data**, never instructions. Quotes rendered to humans or fed to models are render-safe and marked untrusted. A source may be authentic yet prohibited by policy. Many weak sources never outrank a controlling authority by count. License, permissions, and retention travel with every copy. Material sources have an owner or steward path.

### 5.8 Cold-start source curation **[NEW — H8]**

Tenant onboarding is a workflow, not an assumption:

```text
Connect repo/domain
→ auto-propose registry from repo links, docs hosts, and the shipped
  authoritativeSources.js seed (PubMed, SEC EDGAR, …)
→ steward assignment per source group
→ tier-mapping wizard (pack ladder → tenant sources)
→ default state: quarantined_until_curated — quarantined sources can inform
  discovery but never support a material claim
→ capability card scoped to curated coverage only (§18)
```

---

## 6. Claims: compilation, materiality, extraction recall

### 6.1 Claim object

```ts
export interface Claim {
  claimId: string;
  artifactId: string;
  text: string;
  sourceSpan: { start: number; end: number; contextHash: string };  // exact span binding [from B]
  normalized?: {
    subject?: string; predicate?: string; object?: string;
    qualifiers: Record<string, string | number | boolean>;
  };
  type: "factual" | "numeric" | "temporal" | "causal" | "policy"
      | "technical" | "recommendation" | "quote" | "code_example";
  materiality: "critical" | "high" | "normal" | "low";
  riskTier: "low" | "moderate" | "high" | "critical";
  state: ClaimState;
  fingerprint: string;   // survives rewording — carries review history across versions [NEW]
  supersedesClaimId?: string;
}
```

Claims must not be inferred from vague document-level association — every claim binds to an exact span. `code_example` is a first-class claim type in technical docs: "this example works" is a claim, verifiable by sandbox compile/run where the pack enables it.

### 6.2 Materiality rules

Materiality rises when a claim: describes safety, security, money, legal obligation, regulated behavior, or access control · makes a default/automatic guarantee · names a version, date, capability, limit, or eligibility condition · gives a causal promise · tells users what action to take · affects publication, deployment, customer communication, or compliance · can cause material harm if wrong.

**Deterministic materiality floors** are policy, not model judgment: packs and repo policy files may force minimum materiality by path or pattern (§11.3) — e.g. anything in `SECURITY.md` is at least `high`.

### 6.3 Claim-extraction recall program **[NEW — H2]**

The system is sound only over claims it extracts; a missed material claim silently passes everything. Extraction recall is therefore **measured, not assumed**:

- **Dual-path extraction:** the deterministic extractor (shipped `claimExtractor.js`, sentence-based) runs alongside a model extractor; disagreements are sampled into review. Compound, implicit, and cross-sentence claims are the model path's explicit target.
- **Author annotations:** authors may mark material claims inline (e.g. `<!-- aether:claim -->` in Markdown); annotated claims can never be dropped by either extractor.
- **The miss signal:** every claim a human adds post-hoc that the compiler missed is logged as `compiler_miss` and becomes a regression fixture.
- **Benchmarked recall:** extraction recall on the gold corpus is a capability-card field (§18.1) and a release gate (§19.4). Audit sampling of approved artifacts measures recall in production, not just on fixtures.
- **Claim lineage:** `fingerprint` matches claims across artifact versions so dissent, review history, and reuse records survive rewording; unmatched old claims are marked `superseded`, not silently dropped.

---

## 7. Verification pipeline: tiers, memoization, latency, cost **[NEW section — H1, H3, H4]**

### 7.1 The tiered pipeline

Verification is a ladder, cheapest first. Measured baseline: a single full-tribunal verify runs ~14 s (`latency_ms: 14255`, live probe in `docs/API_REFERENCE.md`). The wedge survives only if most claims never reach the tribunal.

```text
0. Deterministic pre-pass  — aetherFlash.js risk scan + policy floors; no LLM; ~instant
1. Verdict reuse           — memoization cache (§7.2); no LLM; no human
2. Tribunal                — only new/changed material claims (proposer→critic→verifier + red team)
3. Human review            — only where the resolver or policy requires it (§8, §12)
```

**Latency budgets (initial targets — measured, then revised):** Flash pre-pass < 1 s · cached verdict < 300 ms · single-claim tribunal p50 ≤ 15 s, p95 ≤ 40 s · PR gate wall-clock p50 ≤ 3 min on a typical docs PR with warm cache, with an async completion path beyond that (the check posts pending → resolves). Latency by tier is an SLO (§26.2), and "safe work is faster than unsafe work" is a ship gate (§32).

### 7.2 Verification memoization (H1 — the single biggest add)

A verdict may be **reused without re-running the tribunal or re-review** if and only if its reuse key is identical:

```text
verdict_reuse_key = SHA-256(
  claim_fingerprint
  + evidence_snapshot_set_hash        // the exact snapshots that supported it
  + policy_pack_version
  + protocol_version                  // resolver + pipeline version
  + capability_card_id                // evaluated verifier range
)
```

Rules:

- Identical key → reuse the verdict and extend warrant lineage with a `verdict_reuse_record` (auditable: what was reused, from where, when). Human-review outcomes attach to the key, so a claim reviewed once stays fast until something real changes.
- **Any** component change → invalidate. Freshness still governs: reuse can never outlive the evidence freshness window or the warrant expiry — a cache hit on stale evidence is a miss.
- Delta verification falls out of the same key: on rebase/edit, only claims whose fingerprint, context, evidence, or policy changed re-verify (Action requirement, §24).
- Scope: tenant-scoped by default; cross-tenant reuse only for public packs over public sources, and never where it could leak private evidence existence.
- Poisoning defense: cache entries carry the full key and the originating warrant signature; any hit is independently re-checkable; cache writes append audit events.

### 7.3 Unit economics and cost control (H3)

Lessons already paid for: the `/batchVerify` 50× metering hole (per-request metering × 50-text batches — fix written in `mcp-worker/src/batchQuota.js`, must be enforced server-side), Base44 credits exhausted until 2026-09-04, and the 3-tier `llmRouter` (Anthropic direct → OpenRouter → Base44) built to dodge burn.

- **Metering unit = the claim-run** (`cost_event`), not the HTTP request. Batch endpoints charge `len(texts)` — port the batchQuota fix upstream; reject batches exceeding remaining quota rather than partially running them.
- **Budgets at every scope:** tenant/month · PR/run (`max_claims_per_run`, §11.3) · mission (`ForgeBoundary.budget`, §21.5) · platform/day. Exhaustion degrades to Flash + cache in **advisory** mode with a visible service-mode label — never silent fail-open, never surprise overage.
- **Cost circuit breakers:** anomalous spend (adversarial PR with thousands of claims, runaway retries) trips per-tenant and per-source breakers; denial-of-wallet is a named threat (§16.1).
- **Tracked:** cost per verification (by tier) · cost per prevented material failure · reuse rate (% verdicts served from cache) · tribunal invocations per PR. Pricing stays honest against measured unit cost.

---

## 8. Decision resolver and deterministic gates

### 8.1 The resolver ladder (B's order, made canonical)

Evaluated top-down per claim; first match wins:

```text
1. Policy prohibits requested use ............................ BLOCKED
2. Injection indicators on load-bearing evidence ............. capped at NEEDS_REVIEW  [NEW — H12]
3. Unsupported domain/jurisdiction ........................... OUT_OF_SCOPE
4. Applicable counterevidence defeats claim (§8.3) ........... CONTRADICTED
5. Support below pack threshold .............................. NOT_SUPPORTED
6. Coverage/applicability/freshness/independence insufficient . NEEDS_REVIEW or UNKNOWN
7. Material limits remain .................................... SUPPORTED_WITH_LIMITS
8. Otherwise ................................................. VERIFIED_FOR_STATED_USE
```

The resolver is deterministic and versioned (`protocol_version`); models may **propose** relations, but only the resolver produces verdicts, and no model output can skip a rung. Verification-run state, claim verdict, warrant status, and publication status are four separate machines (§3.2) — no status laundering.

### 8.2 Material-support predicate (A's gate, fixed)

A material claim can reach a favorable verdict only when every load-bearing relation passes **all** checks:

```ts
function canSupportMaterialClaim(relations: EvidenceRelation[], pack: PolicyPack): boolean {
  const loadBearing = relations.filter(r => r.relation === "entails" || r.relation === "partially_entails");
  if (loadBearing.length === 0) return false;
  return loadBearing.every(r =>
    r.checks.quotePresentInSnapshot &&
    r.checks.allowedByPolicy &&
    r.checks.sourceFreshEnough &&
    r.checks.authoritySufficient &&
    r.checks.scopeCompatible &&
    r.checks.noInjectionIndicators          // [NEW] — the flag is now consumed
  ) && contradictionSearchComplete(pack) && applicabilityRecorded(relations);
}
```

### 8.3 Evidence aggregation semantics **[NEW — H5]**

When relations disagree, resolution is deterministic:

1. **Controlling authority wins:** an `entails` from a pack-controlling tier (tier 0/1) defeats `contradicts` from strictly weaker tiers → `supported_with_limits` with a mandatory qualifier naming the conflict, or `needs_review` if the pack so configures.
2. **Equal-tier conflict** → `contradicted` (when the counterevidence is applicable and fresh) or `needs_review` (when applicability is partial) — never favorable.
3. **Corroboration counts per independence cluster** (§5.6), never per item. Four syndicated copies are one voice.
4. `partially_entails`/`qualifies` alone → at best `supported_with_limits`; `context_only` supports nothing.
5. Missing applicability, freshness, or required contradiction search → rung 6 (`needs_review`/`unknown`) — absence is never support.
6. All tie-breaks and thresholds come from the pack (§11), so two runs over the same inputs always resolve identically.

---

## 9. Warrant architecture

### 9.1 Definition

A warrant is a signed, time-bounded record stating: *at a particular time, Aether evaluated exact claims from exact artifact content, under a particular policy and scope, against preserved evidence snapshots, and reached this bounded decision.* It is not a guarantee, an endorsement, a permanent truth label, or authorization for a high-stakes action.

### 9.2 Schema (canonical — B's schema plus the C4 grafts)

```ts
type AetherWarrantV2 = {
  schema: "aether.warrant.v2";          // v1 = legacy signing (§23.3 migration)
  warrant_id: string;
  revision: number;
  status: WarrantStatus;                // §3.2 — includes "integrity_under_review"
  issued_at: string;
  issuer: { issuer_id: string; key_id: string; environment: "production" | "staging" };

  subject: {
    artifact_hash?: string;
    normalized_claim_hashes: string[];
    claim_ids: string[];
  };

  decision: {
    claim_verdicts: Record<string, ClaimVerdict>;   // per-claim, not one blob
    conclusion: string;
    permitted_use: string[];
    prohibited_use: string[];
    decision_owner_id?: string;                     // accountable human [graft from A]
    review_ids: string[];                           // [graft from A]
    dissent_ids: string[];                          // dissent travels with the warrant
    override_id?: string;
  };

  scope: {
    domain: string; jurisdiction: string[];
    conditions: string[]; assumptions: string[]; exclusions: string[];
  };

  evidence: {
    evidence_pack_hash: string;
    source_snapshot_set_hash: string;
    supporting_evidence_hashes: string[];
    counterevidence_hashes: string[];
    unresolved_unknown_hashes: string[];
    independence_graph_hash: string;
    verdict_reuse_record_ids: string[];             // [NEW — §7.2 reuse is auditable]
  };

  evaluation: {
    policy_snapshot_hash: string;
    protocol_version: string;
    model_provenance_hash: string;
    tribunal_run_hash?: string;
    capability_card_id: string;                     // [graft — makes §18 enforceable]
    service_mode_at_issuance: string;               // [graft — §15.3]
    support: number; coverage: number; applicability: number;
    freshness: number; consistency: number; traceability: number;
    extraction_recall_class: "measured" | "annotated" | "unmeasured";  // [NEW — §6.3]
  };

  validity: {
    valid_from: string; expires_at: string;
    revalidation_policy: "scheduled" | "source_watch" | "continuous";
  };

  integrity: {
    canonicalization: "RFC8785";
    hash_algorithm: "SHA-256";
    signature_algorithm: "Ed25519";
    payload_hash: string;
    signature: string;
    transparency_log_entry_id: string;
  };
};
```

The six evaluation dimensions are surfaced **separately** where depth is needed; no single score is ever the decision (§1.4). Public warrant metadata is separated from private snapshots and protected evidence — warrants carry hashes and IDs, never quotes.

### 9.3 Cryptographic requirements

- Canonicalize with RFC 8785 (JCS); hash canonical UTF-8 bytes with SHA-256; sign with Ed25519; private keys live in KMS/HSM only.
- Publish current and historic public keys at a **signed discovery endpoint** (`/.well-known/aether-keys.json`) with rotation schedule and revocation status.
- Append payload hashes to a Merkle transparency log with signed checkpoints and inclusion proofs. The shipped hash-chained Ed25519 `AuditLog` (`ledger.js`) is the v0 of this log — it upgrades to Merkle checkpoints, it is not replaced.
- Trust-root distribution for offline verifiers: key pinning via the well-known endpoint + transparency-log cross-check; key history survives product retirement (§17.2).

### 9.4 Lifecycle

```text
draft → evaluating → review_required? → issued_active (monitoring)
issued_active → challenged | stale | expired | superseded | revoked | integrity_under_review
challenged → upheld(issued_active) | revised | superseded | revoked
stale → revalidating → issued_active(revision+1) | superseded | revoked | expired
integrity_under_review → issued_active | revoked        // §9.5 only
```

Historic warrants are never deleted; they keep status reason, timestamps, predecessor/successor links, and dependency impact.

### 9.5 Key-compromise runbook

```text
Suspected compromise → freeze affected key (signing halts on that key)
→ security incident + notification → identify exposure-window warrants
→ mark them integrity_under_review → replay/reissue or revoke
→ rotate under independent approval → verify transparency-log continuity
→ publish tenant impact report → create security regression fixture
```

---

## 10. Transparency and independent verification

```text
Warrant signed → canonical hash → tenant-private immutable log event
→ transparency-log submission (optional per tenant) → inclusion proof returned
→ monitors watch for unexpected issuance / revocation / key use
```

Public logs never expose customer content, prompts, secrets, or private rationale — metadata and cryptographic commitments only.

**Independent verifier (ships with the product):**

```text
aether verify-warrant ./warrant.json          # structure, hash binding, signature, key status, lifecycle
aether verify-bundle ./evidence-bundle.zip    # + evidence snapshot hash integrity (bundle = access-controlled)
aether verify-inclusion-proof ./warrant.json  # + transparency-log inclusion
```

`verify-warrant` alone proves integrity and provenance; evidence-content verification requires the bundle — the docs say so explicitly, so nobody mistakes signature validity for evidence access. The shipped `verifyWarrantPublic` endpoint + `WarrantVerifier` page (REMAINING_BUILD_PLAN task #5) are the hosted v0 of this verifier; the CLI is the offline guarantee.

---

## 11. Policy engine and domain packs

### 11.1 Pack anatomy (A§9.1)

Identity + version · source authority ladder (mapped to tiers, §5.5) · allowed/prohibited source classes and hosts · freshness windows **per source class** · claim materiality rules + deterministic floors · evidence thresholds by risk tier · contradiction-search requirements · independence requirements · reviewer roles + quorums · release-gate rules · override rules · retention/privacy/consent rules · revalidation triggers · verdict-reuse configuration · benchmark fixtures with expected verdicts.

### 11.2 First pack: `technical-docs@1.0` (decision C2)

Scope: READMEs, developer docs, API guides and examples, release notes, changelogs, configuration guidance, PR documentation changes, AI-assisted support content tied to versioned sources.

Authority ladder → tiers:

```text
tier 0  versioned product spec / source-controlled canonical docs
tier 1  official API schema / code contract
tier 2  release notes tied to version
tier 3  maintainer-approved internal technical documentation
tier 4  vendor documentation
tier 5  issue tracker / community content — context_only unless explicitly approved
```

Pack option: `code_example` claims verified by sandboxed compile/run — a differentiator no citation checker has. **Second pack:** `mechanical@1.0` (manuals, service bulletins, parts/revision matching, torque specs, recalls) ships as the Forge Work Mode pilot (§21.4) — dedicated policy, authoritative-source rules, and human-review gates before anything field-facing.

### 11.3 Repo policy file (v2 — supersedes A§22.1; align with shipped `policyParser.js` before freeze)

```yaml
version: 2
domain_pack: technical-docs@1.0

scope:
  include: ["README.md", "docs/**/*.md", "CHANGELOG.md"]
  ignore: ["docs/archive/**"]
  changed_files_only: true          # delta verification — §7.2
  max_claims_per_run: 400           # cost cap; excess → advisory + logged, never silent truncation

materiality_rules:                  # deterministic floors — §6.2
  floors:
    - match: "SECURITY.md"
      min_materiality: high
    - match: "docs/api/**"
      min_materiality: high
    - pattern: "(guarantee|always|never|all versions|unlimited)"
      min_materiality: high

sources:
  allowed:
    - host: "docs.example.com"
    - repo: "github.com/example-org/*"   # repo/path prefix — a bare host is not a boundary
  freshness_days:                        # per source class — a pinned spec doesn't rot on a clock
    versioned_spec: 3650
    release_notes: 730
    vendor_documentation: 180
    news_or_secondary: 90

claim_policy:
  required_coverage: { critical: 1.0, high: 0.95, overall: 0.80 }
  contradiction_search_required_for: [critical, high]
  independence_required_for: [critical]

verdict_reuse:
  enabled: true
  respect_freshness: true

release_gate:
  mode: advisory                    # advisory | enforcing — enforcing requires an active capability
                                    # card with measured false-block rate (§18.2)
  block_on:
    - critical_unsupported_claim
    - critical_contradicted_claim
    - evidence_integrity_failure
    - prohibited_source
    - warrant_signature_failure
    - active_security_circuit_breaker
  review_on:
    - high_unsupported_claim
    - conflicting_authorities
    - stale_evidence
    - coverage_below_threshold
    - injection_indicators_present
  review_sla:                       # §12.5 — review_required is never a black hole
    high:     { hours: 72, on_timeout: advisory }
    critical: { hours: 72, on_timeout: remain_blocked, escalate_to: decision_owner }
  degraded_mode:
    manual_review_fallback: true    # §15.4 — a breaker never strands a PR silently
  overrides:
    required_approvals: 2
    require_expiry: true
    require_rationale: true
```

### 11.4 Policy change control

```text
Proposal (rationale + impact estimate)
→ replay against a SAMPLE of historical warrants (full replay for critical packs)
→ adversarial review → policy-owner approval → shadow execution
→ staged rollout → monitoring → rollback or supersession
```

A policy change never silently alters historical warrants; it identifies which decisions require revalidation (§26.4 governs the storm).

---

## 12. Human review and accountability

### 12.1 Roles (A + B merged)

```ts
export type ReviewRole =
  | "author" | "proposer" | "critic" | "verifier"
  | "evidence_reviewer" | "source_steward" | "domain_expert"
  | "risk_owner" | "decision_owner"
  | "independent_adjudicator" | "policy_owner" | "incident_commander";
```

May / may-not: proposers cannot finalize their own material claim · critics cannot silently edit proposer evidence · verifiers cannot solely approve their own work · source submitters cannot solely approve their own evidence · authors ≠ decision owners for critical release · adjudicators must be independent of disputing parties · policy owners cannot retroactively alter decision logs.

### 12.2 Review packet (everything a reviewer needs, in one screen)

Claim · decision requested · risk tier · supporting evidence · contradicting evidence · applicability assessment · authority/freshness/independence summary · policy requirement · suggested safe edit · downstream impact · dissent · override option if allowed · **time-to-decide estimate**.

### 12.3 Disagreement protocol (B)

```text
1 Detect material disagreement → 2 classify (evidence / interpretation / scope / policy / risk tolerance)
→ 3 reveal all arguments + source spans to all reviewers
→ 4 each reviewer states what evidence would change their decision
→ 5 structured reconciliation → 6 unresolved: publish contested result or route independent adjudication
→ 7 no favorable final warrant without required consensus → 8 dissent preserved in the proof record
```

### 12.4 Quorum by risk

| Risk | Minimum decision rule |
|---|---|
| Low | Automated decision with sampled QA |
| Moderate | Automation + one qualified review on exceptions |
| High | Two independent qualified reviewers; documented dissent |
| Critical | Specialist quorum, conflict check, adjudicator on split; no unilateral override |

### 12.5 Review operations **[NEW — H6]**

- **SLAs per tier** (pack-configurable; defaults in §11.3): review queues have owners, depth alarms, and forecasting (expected review load per pack per week) — reviewer capacity is planned, not discovered.
- **Timeout behavior is policy:** `high` decays to advisory with a visible "review timed out" mark; `critical` stays blocked and escalates to the decision owner. `review_required` is never an unbounded PR black hole.
- **Batch review** for many-similar claims: one action, per-claim records preserved — bulk convenience never collapses the audit trail.
- Reviewer calibration tasks, rotation for high-impact reviewers, blind secondary sampling, and reason-coded dissent (B) are standing controls.

### 12.6 Overrides

Named decision owner · risk owner where required · explicit rationale · compensating controls · expiry date · revalidation conditions · dissent references · post-release monitoring commitment. **Critical evidence-integrity failures cannot be overridden.** Override expiry automatically creates a revalidation job and flips display state — expiry is an event, not a suggestion.

---

## 13. Velocity and the correction economy

### 13.1 Design goal

Safe work must be faster than unsafe work — now backed by mechanism, not hope: memoization (§7.2), delta verification, Flash pre-pass, batch review, and safe-repair actions. When Aether finds a problem it always offers: attach evidence · narrow claim · apply safe rewrite · add qualifier · request review · open a Forge mission.

### 13.2 Four behaviors, four treatments (B)

| Behavior | Example | Treatment |
|---|---|---|
| Good-faith uncertainty | "I think X; here's why; confidence low" | Encourage; no penalty |
| Honest error | Evidence later changes or was misread | Correct, learn, modest reputation adjustment |
| Negligent assertion | Strong claim, required evidence missing, scope ignored | Friction, reduced publishing privileges, remediation |
| Deceptive manipulation | Fabricated sources, altered quotes, repeated scope laundering | Immediate containment, investigation, severe sanction |

Never punish a contributor merely because a claim was later revised. Penalize process failures and deception, not honest falsification.

### 13.3 Control ladder (velocity-preserving)

```text
Low-risk / private draft            → warn; request scope/evidence
Medium-risk / team-facing           → claim template + cited source required
High-risk / public or decision-critical → independent evidence + reviewer approval + warrant eligibility
Repeated negligence                 → lower publishing tier; training; sampling escalation
Confirmed deception                 → freeze publishing, revoke privileges, investigate, notify impacted
```

### 13.4 Budgets and reputation (A's typed contracts)

```ts
export interface AssertionBudget {
  teamId: string; domainPackId: string;
  unresolvedWeightLimit: number; currentUnresolvedWeight: number;
  criticalClaimsAllowedWithoutEvidence: 0;
  openOverrideDebt: number;
  evidenceContributionCredit: number; validatedCorrectionCredit: number;
}

export interface DomainReputation {
  subjectId: string; domainPackId: string;
  role: "author" | "reviewer" | "source_steward" | "challenger";
  evidenceQuality: number; scopeDiscipline: number; calibration: number;
  correctionResponsiveness: number; challengeValidity: number;
  reviewOutcomeAlignment: number;
  conflictOfInterestStatus: "clear" | "declared" | "restricted";
  privileges: string[];
}
```

Reputation is per-domain, per-task, time-decayed, explainable, appealable, weighted for task difficulty — and **never** a public individual truth score (§27).

### 13.5 Bonds and credits (decision C6)

Accountability bonds are non-transferable, fund correction and independent review, and apply **only to public high-reach publishing — never the dev/CI wedge** (developers do not post bonds to merge PRs). No bond for private drafts; forfeiture only after adjudicated negligence/deception, with appeal. Credits are closed-loop (missions, bounties, review compensation) with controlled issuance and anti-fraud rules. **Prohibited at launch:** transferable tokens, NFTs, public employee rankings, rewards for volume or controversy, voting that overrides source quality or accountable ownership.

### 13.6 Anti-gaming

Verified identity tiers for paid work · sybil resistance · affiliation disclosure · collusion detection · random audit sampling · independent re-review · rate limits and diminishing returns · source-quality floors · no self-review or reciprocal rings · public audit trail for material decisions.

---

## 14. Correction, challenge, and incident system

### 14.1 The loop

```text
Challenge or monitor detects issue → preserve original decision + artifact
→ classify severity + blast radius → contain (qualify / block / revoke / withdraw)
→ investigate root cause → remediate (policy / source / retrieval / model / interface)
→ add regression fixture → release-gate validation
→ revalidate affected warrants (§26.4 storm control) → notify owners
→ publish appropriate transparency record
```

### 14.2 Incident types

A's taxonomy (false_pass · false_block · citation_fabrication · evidence_misalignment · source_authority_failure · freshness_failure · scope_failure · policy_failure · prompt_injection · retrieval_poisoning · data_leakage · cross_tenant_access · key_compromise · warrant_integrity_failure · reviewer_abuse · override_abuse · forge_hypothesis_contamination · revalidation_failure) **plus [NEW]:** `cost_abuse` (denial-of-wallet) · `cache_poisoning` (memoization integrity) · `extraction_miss` (compiler false negative) · `scope_laundering` (display-eligibility bypass). Every incident carries a severity scale (S1–S4) and every confirmed one produces a regression fixture — challenge-contributed fixtures are themselves reviewed before entering the suite (fixture poisoning is a named threat, §16.1).

### 14.3 Correction debt

```text
Correction Debt = Σ( severity × impact × recurrence × min(age, AGE_CAP) × downstream exposure )
```

One unresolved critical false pass outweighs many cosmetic issues. The age term caps once risk is formally accepted by a decision owner — accepted-risk items stop growing but never disappear from the ledger.

---

## 15. Drift, circuit breakers, and service modes

### 15.1 Boundaries (A + B merged)

| Boundary | Catastrophic failure | Containment / breaker |
|---|---|---|
| Source ingestion | Poisoned, forged, unauthorized source enters trusted pool | Quarantine, provenance, source health, independent checks |
| Retrieval | Counterevidence systematically omitted | Diversity rules, adversarial retrieval, coverage alerts |
| Claim extraction | Qualifiers, negation, conditions dropped; claims missed | Span binding, dual-path extraction (§6.3), semantic-diff tests, human confirmation for material claims |
| Interpretation / model | Model follows injected content or overstates evidence | Isolation, constrained tools, output validators, resolver caps (§8.1 rung 2) |
| Evidence aggregation | Copies counted as corroboration | Independence clusters (§5.6), lineage graph |
| Authority | Weak source overrides controlling authority | Freeze pack / source hierarchy |
| Memoization | Stale or poisoned verdicts reused | Full-key invalidation, signed cache entries, reuse audits (§7.2) **[NEW]** |
| Promotion | Hypothesis enters supported knowledge | Promotion firewall (§21.5); pause Cosmos promotion |
| Publication | Narrow result reused broadly | Display eligibility + semantic diff (§20) |
| Propagation | Bad warrant spreads unchecked | Revoke warrant family; blast-radius revalidation |
| Identity | Tenant/role boundary breached | Emergency freeze; security incident |
| Signing | Key or canonicalization failure | Halt issuance; §9.5 |
| Cost | Runaway or adversarial spend | Cost breakers → advisory mode (§7.3) **[NEW]** |
| Availability | Dependency outage causes unsafe fallback | Manual-review or fail-closed mode |
| Human review | Colluding, fatigued, captured reviewers | Conflict controls, rotation, calibration, audit sampling |
| Incentives | Optimizing volume or drama | Quality-weighted rewards, delayed payouts, anti-sybil |

### 15.2 Drift indicators → actions (B)

```text
Favorable rate ↑ while challenge-overturn rate ↑  → freeze high-risk issuance; calibration review
Independence drops in a domain                    → downgrade favorable eligibility; require primary sources
Source-change cascade misses SLA                  → mark affected warrants stale; halt favorable badge refresh
Reviewer agreement collapses / one dominates      → suspend deciding role; arbitration + calibration
Extension extraction errors spike after host update → kill adapter; never verify uncertain extraction
Policy changed without evaluated test suite       → refuse production activation
Reuse rate ≈ 100% with zero invalidations         → audit the cache — suspiciously quiet is a signal  [NEW]
```

### 15.3 Breaker levels and service modes

Levels 0–4 (normal → monitor+ → downgrade automation, require review → suspend favorable warrants in domain → integrity incident: freeze signer path, mark outputs stale/revoked).

```ts
export type TrustServiceMode =
  | "normal" | "degraded_read_only" | "evidence_retrieval_degraded"
  | "model_evaluation_degraded" | "signing_degraded" | "revalidation_backlog"
  | "cost_limited"                     // [NEW — §7.3]
  | "security_incident" | "manual_review_only" | "emergency_freeze";
```

### 15.4 Required degraded behavior

Never issue a new favorable warrant on unknown or stale inputs · never silently downgrade a hard block into a warning · preserve read-only audit access where safe · label every API response and UI session with service mode · explicit authority required to enter and clear emergency modes · every transition is an immutable `service_mode_event` · every degraded mode has a maximum permitted duration and an escalation path · the PR gate always keeps a manual-review path (`manual_review_fallback`) so a breaker never strands a team.

---

## 16. Security

### 16.1 Threat model

Prompt injection · insecure output handling · training/data/model poisoning · model denial of service · **denial-of-wallet / cost inflation [NEW]** · supply-chain compromise · source substitution · citation fabrication · retrieval poisoning · **memoization-cache poisoning [NEW]** · **canonicalization attacks (delimiter/encoding ambiguity — the shipped signer's `join('|')` weakness is the local proof) [NEW]** · **benchmark-fixture poisoning via challenge intake [NEW]** · credential theft · key compromise · cross-tenant access · insider misuse · privilege escalation · artifact tampering after verification · reviewer collusion · override abuse · excessive agent authority · webhook spoofing/SSRF (`webhook_url` is caller-supplied — validate server-side; `ssrf.js` exists, reuse it) · sensitive-information disclosure.

### 16.2 Trust boundaries (B — one line each, absolute)

```text
Web content ≠ instructions             Model output ≠ evidence
Evidence snapshot ≠ sharing permission  Extension page UI ≠ trusted extension UI
Forge hypothesis ≠ verified claim       Warrant signature ≠ permission to act
Cache hit ≠ fresh verification          [NEW]
```

### 16.3 Controls

Zero-trust tenant authorization on every request and graph edge · data classification before model routing · redaction + secret scanning before third-party model calls · isolated parsers/workers for untrusted content · domain allowlists + source registry · signed snapshots + content-hash verification on read · OIDC + short-lived credentials + least privilege (GitHub Actions authenticate via OIDC federation, not long-lived PATs) · KMS/HSM keys, rotation, revocation · SHA-pinned CI actions, SBOM, signed build provenance, artifact verification at deploy · rate limits, cost budgets, queues, circuit breakers · signed webhooks, replay protection, idempotency, dead-letter queues · security regression fixtures for every confirmed class · independent warrant verifier · tamper-evident audit events + transparency proofs · tested backup/restore and key recovery · environment separation, production access logging, break-glass controls.

Aether's own pipeline must be more trustworthy than the warrants it issues; provenance is only useful when verified at the consuming stage — the same principle as the release gate itself.

### 16.4 Vulnerability disclosure program **[NEW — H11]**

Replace the placeholder `SECURITY.md` with a real policy: private reporting channel (GitHub private vulnerability reporting + security@sf2x.com) · 72-hour triage SLA · scope (app, API, worker, extension, Action, SDKs) · safe harbor for good-faith research · coordinated disclosure terms · no public bounty promises until the P7 program exists. This ships in week one (§29) — a trust product with template boilerplate in `SECURITY.md` is self-refuting.

---

## 17. Privacy, sovereignty, portability, exit

### 17.1 Customer guarantees

No training on customer data by default · explicit, testable tenant boundaries · export of owned sources, snapshots, warrants, decisions, audit logs, graph relations, and correction history · offline-verifiable exported warrants · explicit retention/deletion/legal-hold/archival policy · private evidence citable via redacted or access-controlled proof bundles · bring-your-own models, sources, policies, and (where required) keys · customers keep their epistemic history if they leave.

### 17.2 Decommissioning

```text
active → deprecated → read_only → archived → customer_exported
→ independently_verifiable_offline → deleted_or_retention_exception
```

On retirement of the product, a tenant, a pack, or an integration: the offline verifier remains available or is open-sourced under a durable license; public key history and revocation lists remain accessible; retired packs are archived with final rules and capability cards; active warrants get an explicit retired/expiry state. No customer is ever forced to trust a live Aether UI to inspect historic decisions.

### 17.3 Deletion honesty

Deletion distinguishes user-facing content, snapshot metadata, audit requirements, legal hold, cryptographic proof-of-former-existence, derived graph data, and evaluation telemetry. Never claim deletion while immutable audit or regulatory records remain — state exactly what remains and why.

---

## 18. Capability cards and symmetric gating

### 18.1 The card

```ts
export interface VerifierCapabilityCard {
  capabilityCardId: string;
  verifierVersion: string;              // ties to verifier_release + warrant.evaluation
  domainPackId: string;
  evaluatedTasks: string[]; prohibitedTasks: string[]; knownLimitations: string[];
  benchmarkVersion: string;
  falsePassRateByRisk: Record<"low" | "moderate" | "high" | "critical", number>;
  falseBlockRateByRisk: Record<"low" | "moderate" | "high" | "critical", number>;
  extractionRecall: number;             // [NEW — §6.3 is measured, or the card says so]
  evidenceAlignmentRate: number; citationIntegrityRate: number;
  calibrationError?: number; sourceSelectionBiases: string[];
  validFrom: string; reviewedAt: string; expiresAt?: string;
}
```

### 18.2 The gate — symmetric **[H12]**

**No automatic favorable high-risk decision** when: no active card for the pack · evaluation coverage insufficient for the claim category · model/rule version outside the evaluated range (enforceable now — the warrant records `model_provenance_hash` + `capability_card_id`) · a drift breaker is active · required source or applicability checks cannot complete.

**And symmetrically: no default hard-blocking** in CI without a measured false-block rate below the pack threshold. Until then `release_gate.mode: advisory` — annotations and neutral checks, enforcement opt-in per repo with explicit acknowledgment. The lesson is measured, not theoretical: SF2X's honest-silence engine over-silenced at 72.2% false-silence on KNOWN queries — an over-blocking gate kills adoption exactly the way over-silence kills answerability. False-block is a first-class metric with the same status as false-pass.

---

## 19. Benchmarks and evaluation

### 19.1 What the benchmark must measure

Finds material claims (extraction recall — §6.3) · aligns evidence correctly · identifies scope/version/freshness/authority limits · detects contradictions · **scores independence correctly** · abstains when it should · blocks when policy requires · does not over-block valid content · preserves reproducibility and warrant integrity · resists adversarial sources and workflows · **stays within latency and cost budgets (§7)**.

### 19.2 Failure families (A's 28 + B's corpus + new)

```text
direct_support · qualified_support · unsupported_claim · direct_contradiction
legitimate_authority_conflict · stale_evidence · scope_mismatch · version_mismatch
jurisdiction_mismatch · numeric_error · unit_error · date_error
citation_fabrication · citation_misalignment · weak_authority_source
independence_failure            [NEW — syndication counted as corroboration]
prompt_injection · retrieval_poisoning · data_or_model_poisoning
policy_mismatch · multi_hop_inference · causal_overclaim · out_of_scope_claim
adversarial_plausibility · artifact_tampering · signature_failure
revalidation_failure · reviewer_override_failure · hypothesis_contamination
cross_tenant_authorization_failure
scope_laundering_edit           [NEW — §20 semantic diff]
extraction_recall_miss          [NEW — compound/implicit/cross-sentence claims]
cache_reuse_when_invalid        [NEW — §7.2]
cost_abuse_batch                [NEW — metering correctness under adversarial batches]
code_example_failure            [NEW — technical-docs pack option]
ocr_or_screenshot_error · extension_dom_mutation · warrant_composition_failure   [from B]
```

### 19.3 Strategy

Public fixed suite (reproducibility) + private rotating holdout + adversarial red-team suite + production correction-derived fixtures (reviewed before entry — §14.2) + shadow evaluation before any model/policy change + canary rollout + rollback thresholds. The shipped red-team arena, benchmark page, leaderboard, and calibration store are the v0 assets of this program — extend, don't rebuild.

### 19.4 Release gates

Unsupported-favorable rate · correct abstention · correct block/escalation · **false-block rate** · claim-span extraction integrity + recall · snapshot integrity · independence accuracy · scope/jurisdiction accuracy · revalidation/cascade latency · extension extraction reliability · tenant isolation · latency/cost budgets · accessibility · reviewer calibration and conflict compliance.

### 19.5 Unknown-unknown program

Random audit samples of approvals · independent blind review · surprise-failure taxonomy · novelty detection · quarterly capability-boundary review · postmortems for high-impact unclassified failures.

```text
Unknown-Unknown Rate = confirmed material failures with no taxonomy label
                     / all confirmed material failures
```

### 19.6 Dogfooding and the marketing law **[NEW — H10]**

- **Aether verifies Aether:** this repo runs the Action on its own README and docs; the post-deploy "fix endpoint docs" commit is the standing proof this failure class is real. Ship gate: Aether's own material public claims carry warrants.
- **Marketing claims obey §3.1 rule 18:** the README's benchmark table ("AUC 1.0 · Perfect separation · 91/100 vs 14/100") gets n, dataset description, and methodology link beside the numbers — or the claim narrows. Precedent is in-house: SF2X's crystal-vs-RAG verdict was published as "NARROW THE CLAIM" with honest costs stated, and its benchmark rule is locked: *do not claim wins beyond measured advantages.* Aether markets the same way or it is self-refuting.

---

## 20. Semantic diff, display eligibility, anti-laundering

A warrant binds to text, source span, surrounding context, scope, policy, protocol, and freshness. Display eligibility is a computation, not a vibe:

```text
content_hash + claim_range + context_hash + scope_version + policy_version
+ warrant_status + freshness_status  =  display eligibility
```

```text
Original: "May reduce energy use by 10% under test condition X."
Edited:   "Reduces energy use by 10%."
Result:   scope-loss detected — the warrant detaches from the visible text.
```

If any material component changes, the UI says: **"This verification no longer matches the visible text."** with actions: view prior verification · compare revisions · reverify this version · open affected-proof map.

**Composition rule:** a collection of warranted claims does not automatically warrant a synthesized or causal conclusion. Report composition validates dependency compatibility and issues a **composition warrant** when eligible — otherwise the synthesis displays as inferred/unwarranted. Studio cannot strip required qualifications from high-risk exports (§21.6), and embeds re-check eligibility on render.

---

## 21. Surfaces: Airlock, Cosmos, Forge, Studio, Bridge

### 21.1 Airlock — low-friction truth entry

Guest-first: paste text, drop a URL, upload a document or screenshot, speak a field note — verify before signing up. Guest traffic runs the tiered pipeline with strict per-IP budgets and Flash-first defaults (§7.3); the SF2X guest-cap pattern (per-IP 429) is the precedent. Supported inputs: selected text · AI chat response · URL · screenshot/OCR · document · video transcript · voice note. Every intake preserves the raw artifact before anything touches it.

### 21.2 Cosmos — the action map

Lenses: evidence · conflict · time · applicability · impact/blast-radius · ownership · unknowns · risk · correction · opportunity.

```ts
export type CosmosNodeType =
  | "claim" | "source" | "evidence" | "warrant" | "policy" | "decision"
  | "question" | "contradiction" | "gap" | "hypothesis" | "experiment"
  | "artifact" | "person_or_team" | "system" | "event";

export type CosmosEdgeType =
  | "supports" | "contradicts" | "qualifies" | "derived_from" | "verified_by"
  | "governed_by" | "supersedes" | "invalidates" | "depends_on"
  | "raises_question" | "tested_by" | "produced" | "approved_by" | "affects";
```

Anti-failure rules: a highly connected node is not assumed reliable · visual prominence distinguishes authority, freshness, epistemic state, and downstream impact · hypotheses live in a different namespace, storage path, style, and retrieval filter · every conflict/gap/revocation node has a next action · users start from a warrant, claim, decision, or question — never a global graph · 2D action usability ships before any 3D layer.

### 21.3 Forge — the 4D disassembly and invention machine

Forge accepts an object, text, procedure, diagram, paper, product page, codebase, dataset, or archive and reveals **structure** (parts, claims, steps, dependencies, constraints), **causality** (mechanisms, failure paths, assumptions), **time** (versions, drift, revisions, retractions, history), and **possibility** (unknowns, contradictions, hypotheses, experiments).

```text
Input → preserve raw artifact → extract parts/claims/procedures/constraints
→ bind claims to exact spans/components → gather supporting AND counterevidence
→ score applicability, freshness, independence, coverage
→ surface contradictions and unknowns → identify the frontier
→ form explicitly labeled hypotheses → design the smallest safe experiment
→ ingest observations as evidence candidates → human/policy review
→ revise decision or preserve uncertainty
```

**Work Mode** (daily use, ships first): left structure panel (parts/claims/constraints/hazards/unknowns) · central system/claim map · right evidence panel (source spans, contradictions, applicability, freshness, warrant/limits) · bottom time+lineage bar · keyboard-accessible, fast on mobile, legible in field conditions. **Infinity Mode** (cinematic 3D, later): components and claims explode outward; evidence becomes support structure; contradictions create visible tension; unknowns form frontier volumes; time is scrubbable; hypotheses are translucent branches, never green proof objects; every interaction can return to Work Mode. Low-end fallback + reduced motion required.

**Frontier Map:**

| Region | Meaning | Allowed next action |
|---|---|---|
| Known | Strong, scoped support | Apply within scope; monitor |
| Contested | Material conflict | Compare, challenge, gather discriminating evidence |
| Missing | Absent measurement or source | Request data or plan research |
| Constrained | Law, safety, material, cost, or time limit | Design within the boundary |
| Possible | Testable hypothesis | Define experiment; never present as fact |

**Ownership (decision C7):** the Forge *surface* is built here; the Forge *engine* is SF2X ladder phases 9–11 (Disassembly Engine → Concept Forge → 4D Interface) and is built in D:\SF2X in ladder order. No parallel engine build.

### 21.4 Forge missions and research missions

A mission is an auditable investigation, not a chat response with citations.

```ts
export type ForgeMissionType = "verify" | "resolve" | "repair" | "experiment" | "invent";
```

| Trigger | Mission | Output |
|---|---|---|
| Evidence gap | Verify | Evidence packet or justified abstention |
| Contradiction | Resolve | Scoped resolution or preserved dissent |
| Repeat failure | Repair | Root cause, remediation, validation, regression test |
| Causal uncertainty | Experiment | Method, result, limitations, data lineage |
| Evidence-backed opportunity | Invent | Hypothesis + falsifiable experiment plan |

Mission templates (B): verify an AI response/URL/public claim · investigate a product, quote, listing, warranty · diagnose a technical/mechanical system · literature review + contradiction analysis · vendor/technical due diligence · policy/contract/compliance review · hypothesis stress test · experiment design. Every template carries source strategy, retention, risk tier, publication permissions, review thresholds, and warrant eligibility.

### 21.5 Mission boundary and the promotion firewall

```ts
export interface ForgeBoundary {
  missionId: string;
  inheritedFromNodeIds: string[]; sourceWarrantIds: string[];
  domainPackId: string;
  allowedSourceIds: string[]; prohibitedSourceClasses: string[];
  riskTier: "low" | "moderate" | "high" | "critical";
  executionAuthority: "none" | "simulation_only" | "approval_required";
  requiredReviewRoles: ReviewRole[];
  budget: { timeMinutes?: number; retrievalCalls?: number; modelCostUsd?: number };  // §7.3
  ownerId: string; decisionOwnerId?: string;
  closureCriteria: string[];
}
```

```text
hypothesis → proposed experiment → observed result → evidence review
→ policy adjudication → human approval where required
→ supported inference or decision → warrant → Cosmos promotion
```

No Forge output becomes supported knowledge automatically. Forge cannot widen permissions silently — boundaries are inherited, never self-expanded.

**Causal humility protocol** (required for causal missions): causal question · alternative explanations · confounders · proposed mechanism · counterfactual/comparison approach · success metric · safety threshold · stop condition · rollback plan · outcome limitations. Forge may report correlation, uncertainty, or a test plan; it must not imply causation because a narrative sounds convincing.

**Pilot vertical:** `mechanical@1.0` — manuals, service bulletins, parts/revision matching, wiring/assembly diagrams, diagnostic readings, safety constraints, torque specs and procedural order, recalls. Concrete, source-rich, visually intuitive, field-suited. Medical/legal/finance come later only with dedicated packs, authoritative-source rules, review gates, and safety validation.

### 21.6 Studio — proof artifacts, not marketing outputs

Artifact types: warrant cards + proof pages · claim/evidence matrices · research reports · Forge walkthroughs + timelines · technical procedure packets · video artifacts with citation anchors · embeddable badges · audit/replay packages · decision memos · incident reports · policy comparisons · experiment dossiers · release notes · audit exports.

Every artifact carries: version · bound warrant IDs · current status (auto-updating) · scope and limitations · issue/expiry dates · proof link. Studio cannot convert a conditional or disputed conclusion into absolute copy without re-verification (§20), and cannot remove required qualifications from high-risk exports. Embeds and OG cards re-check display eligibility on render — a revoked warrant's badge goes gray everywhere at once.

### 21.7 Bridge — the policy decision point

Bridge is the PDP, not a retrospective dashboard:

```text
User / agent / extension / API client → Bridge PDP → signed policy-decision token
→ enforcement points: gateway, storage, retrieval, models, tribunal, signer,
  Forge, Studio, extension, webhooks
```

Policy hierarchy: platform safety → domain/regulatory pack → organization → workspace/project → role/attributes → request-specific limits. **Explicit deny always wins; the most restrictive applicable policy controls.**

Controls: RBAC + ABAC · tenant/role/project/purpose/classification/jurisdiction/device/session · SSO/SAML, SCIM, MFA, service identities · model/provider/region/tool allowlists · source licensing and authority policies · data residency, retention, deletion, export, legal hold · human-review and separation-of-duties enforcement · policy-as-code with tests, simulation, canaries, staged rollout, rollback · time-limited, justified, logged break-glass · fail-closed for high-stakes workflows. Bridge connectors (GitHub, docs platforms, ticketing, identity, CI/CD, model providers, data sources) authenticate, authorize, classify, preserve source identity, apply source policy, record sync events, detect change, trigger revalidation — and never silently widen permission.

---

## 22. Extension and low-friction intake

**User promise:** *verify this exact response as it appears now* — never "this site/model/author is trustworthy."

### 22.1 Hardening (B's table — the spec the shipped extension is audited against)

| Failure | Control |
|---|---|
| Streaming or post-verification mutation | Completion detection, debounce, exact range hash, MutationObserver invalidation |
| Bad extraction | Versioned adapters, fixtures, confidence, visible preview, manual selection fallback |
| Prompt injection | Imported web content is data only, never instruction |
| Fake compatible site | Origin allowlist, signed adapter registry, obvious origin display |
| UI spoofing | Isolated extension context, shadow DOM, confirmations in trusted UI |
| Credential exfiltration | OAuth / short-lived tokens; service-worker-only secret storage |
| Message spoofing | Validate sender, tab, frame, origin, nonce, schema, capability |
| Data leakage | Consent, redaction preview, DLP, minimal payload, retention + tenant binding |
| Cache poisoning | Cache key includes exact hash, context, policy, source strategy, protocol version (§7.2) |
| Staleness | TTL, warrant status refresh, source-watch events, explicit cached state |

### 22.2 State machine

```text
DISABLED → ENABLED → DETECTING → CAPTURE_READY → CONSENT_REQUIRED
→ SUBMITTING → VERIFYING → RESULT_BOUND → INVALIDATED → REVERIFY_REQUIRED
Error/terminal: OUT_OF_SCOPE | RATE_LIMITED | BLOCKED | ERROR
```

Favorable UI appears only while `RESULT_BOUND` content, scope, freshness, and warrant status remain valid. The shipped Chrome extension (ChatGPT/Claude/Gemini/Copilot/Perplexity) is audited against this table with adversarial fixtures before any store-listing claims reference it (§28 gap register: currently **unverified**).

---

## 23. API contract and the v1 → v2 migration **[H7]**

### 23.1 Public API v2 (target surface)

```text
POST /v2/artifacts                    POST /v2/verifications
GET  /v2/verifications/{id}           GET  /v2/verifications/{id}/events
GET  /v2/claims/{id}                  GET  /v2/claims/{id}/evidence
POST /v2/claims/{id}/challenge
POST /v2/warrants                     GET  /v2/warrants/{id}
GET  /v2/warrants/{id}/proof          GET  /v2/warrants/{id}/dependents
POST /v2/warrants/{id}/revalidate     POST /v2/warrants/{id}/challenge
POST /v2/missions                     POST /v2/missions/{id}/experiments
POST /v2/forge/sessions               POST /v2/forge/sessions/{id}/hypotheses
POST /v2/experiments/{id}/observations
POST /v2/webhooks
GET  /.well-known/aether-keys.json
```

v2 responses return per-claim `ClaimVerdict`s + the six evaluation dimensions; `trust_score` survives only as an optional display summary, never the decision.

### 23.2 Legacy (v1) mapping and compat window

Live today: `POST /api/functions/verifyResponse | batchVerify | webhookVerify | warrantApi` with `trust_score` + verified/contested/rejected — consumed by both SDKs, the Action, the extension, and the MCP worker. Rules: v1 endpoints freeze (bugfix-only) · v2 ships alongside with a mapping table (verified→verified_for_stated_use etc., documented lossy) · SDKs bump major versions · deprecation window ≥ 90 days with dashboard + header warnings · the MCP worker (OAuth 2.1 + SSE, shipped) fronts v2 and exposes mission/claims tools (`search_claims` — REMAINING_BUILD_PLAN task #6). Server-side per-text metering for `batchVerify` (§7.3) lands **before** any new batch marketing.

### 23.3 Signing migration (dual-sign window)

Current signing input is `[av.id, answer_text, premises.join(';;'), sources.join(';;')].join('|')` — delimiter-ambiguous (a `|` or `;;` inside content forges colliding inputs). Migration: introduce RFC 8785 canonical payloads signed as `aether.warrant.v2` **alongside** the legacy signature for a dual-sign window · verifiers accept both, tagged by schema version · new warrants become v2-only after the window · legacy warrants stay verifiable forever via archived legacy verification logic + published key history. No historic warrant is orphaned.

---

## 24. GitHub Action and the PR gate

Requirements (A§22 + delta + symmetric gating):

- Scan changed files and relevant generated artifacts (`changed_files_only`), bind verification to commit/tree/artifact hash, re-run after rebase or material change — **delta verification via the reuse key (§7.2)**: unchanged claims cost nothing.
- Post claim-level annotations (shipped: `postPrReview` inline annotations), not just one check result; provide safe rewrite suggestions; attach the signed warrant bundle; "copy as markdown" report export.
- **Advisory mode is the default** (§18.2). Enforcement (branch-protection blocking) is opt-in per repo and requires an active capability card with measured false-block rate. `review_on` outcomes respect the review SLAs (§12.5) — a PR is never stranded in silence.
- Least-privilege permissions; OIDC federation to Aether (no long-lived secrets); actions pinned by commit SHA; CI build provenance on the Action itself; fail closed for configured critical conditions; manual-review path preserved in degraded modes.
- Prereq (shipped-blocking): GitHub connector scope upgrade to `pull_requests:read` + `pulls:write` for auto-fetched diffs and inline reviews (REMAINING_BUILD_PLAN task #1).

---

## 25. UX and contract-break patterns

### 25.1 Author view

Per material claim, exactly one display state (§3.2 mapping). Every disposition shows: what changed / what is wrong · why it matters · the exact supporting or conflicting evidence · scope + freshness warnings · affected artifact locations · safe repair actions · owner + due date · warrant/review state.

### 25.2 Contract-break table (B)

| Trigger | User-visible state | System action | Primary CTA |
|---|---|---|---|
| Source changed | "Evidence changed; this result needs recheck." | Mark stale; queue revalidation | View change / recheck |
| Source retracted | "A supporting source was retracted." | Remove favorable display; cascade | See impact |
| Contradictory evidence | "Credible evidence now conflicts." | Move to contested | Compare evidence |
| Scope edit | "This text no longer matches the verification." | Unbind warrant (§20) | Verify this version |
| Expired warrant | "Verification window ended." | Expire display state | Revalidate |
| Incomplete extraction | "I may not have captured enough context." | Refuse favorable decision | Select more context |
| Policy changed | "Your policy no longer permits this result." | Block display/export if required | View policy reason |
| Reviewer deadlock | "Reviewers disagree on a material issue." | Block final warrant; escalate | View disagreement |
| Data/privacy issue | "This item cannot be processed under current permissions." | Stop processing | Change permissions |
| Integrity incident | "This proof is temporarily unavailable while integrity is checked." | Freeze output; audit | Follow status |

### 25.3 Rules

Plain language first, technical detail one click deeper · preserve history, never erase it · show what changed, when, why, and what depends on it · one primary next action · never green for stale/invalidated/superseded/disputed · never blame users for system uncertainty · stronger interruption patterns in high-stakes contexts · keyboard-accessible review actions · text alternatives for graph meaning · color never the only risk signal · timezone-aware dates · exportable decision packet for offline review.

---

## 26. Operational reliability and platform risk

### 26.1 Dependency doctrine

| Dependency | Failure | Safe behavior |
|---|---|---|
| Model provider | Outage or drift | Disable auto-approval; manual review or pinned fallback (`llmRouter` 3-tier is the shipped v0) |
| Retrieval provider | Outage or bad ranking | Restrict to registry/cache; return unknown |
| Source host | Changed/deleted content | Use authorized snapshot; mark freshness/access loss |
| Identity provider | Outage | Deny high-risk actions; preserve read-only audit if safe |
| GitHub | Webhook mismatch | Bind to artifact hash; re-run at merge |
| KMS/signing | Unavailable | No new active warrants (`signing_degraded`) |
| Graph/index | Stale or corrupt | Fall back to canonical evidence/event stores |
| Database | Partial write | Transactional outbox; never sign without a durable event |
| Policy/model update | Behavior shift | Shadow evaluation, canary, rollback |
| **Base44 platform [NEW]** | Function flap / credit exhaustion / egress limits | §26.3 risk register |

### 26.2 SLOs (measured, with targets from §7.1)

Warrant issuance availability · verification latency by risk tier (targets §7.1) · verdict-reuse rate · cost per verification · evidence snapshot durability · audit event durability · revalidation completion time · critical source-change detection time · review SLA compliance · transparency-log submission success · false-pass and false-block rates · incident containment time · RTO/RPO.

### 26.3 Base44 platform risk register **[NEW — H7]**

Evidence: all three fixable states observed in one documented day (2026-08-09 — 404 "function not deployed", 500 permission error, then live 401s); integration credits exhausted until 2026-09-04 blocking InvokeLLM/SendEmail/UploadFile; the nightly export exists precisely because `Base44 answers 200 []` to bad keys.

Mitigations (standing): the LLM path already bypasses platform credits (Anthropic direct → OpenRouter → InvokeLLM last) · nightly full-schema export is the data lifeboat — tested restore is part of DR, not a nice-to-have · the Substrate Interface (§4) is the exit seam: canonical stores can move to the SF2X rail (Supabase/pgvector) as a storage migration when the rent-rail lands · availability SLOs are published only for what Aether controls; platform-dependent paths carry an honest dependency note. Decommissioning guarantees (§17.2) apply to Aether's own platform choices too.

### 26.4 Revalidation storm control **[NEW — H9]**

When a popular source changes, thousands of warrants may depend on it. Scheduling policy: priority = risk tier × downstream exposure (dependents count) × expiry proximity · critical first, batched windows for the rest · **lazy revalidation** for low tiers (revalidate on next read/reuse attempt instead of eagerly) · if the queue breaches SLA, affected warrants flip to `stale` and favorable display is suppressed — visible honesty instead of silent lag (this is a drift indicator, §15.2).

### 26.5 Disaster recovery

Multi-region backups for canonical stores · tested restore procedure · key recovery tested separately from data recovery · append-only log integrity verification after restore · read-only recovery mode runbook · quarterly failure exercise · tenant export tested as an operational procedure.

---

## 27. Rights, appeals, fairness, power controls

- No public individual truth or reliability score — ever. Private, explainable performance feedback only.
- Right to challenge evidence attribution and reviewer decisions; independent appeal route for high-impact decisions.
- Conflict-of-interest disclosure and recusal; appeals are not popularity contests.
- Clear separation between epistemic quality signals and employment discipline.
- Monitoring for disparate review burden or penalty by role, language, location, seniority, team.
- Auditability of policy and reputation changes; privacy review for high-impact deployments.

```text
Appeal filed → receipt + preservation → conflict check → independent reviewer
→ evidence and policy replay → decision → rationale + remedy
→ policy/benchmark update if systemic
```

---

## 28. Current-state gap register (what this plan is cut against)

First cut 2026-08-10; evidence in `docs/AETHER_MASTER_PLAN_SYNTHESIS.md` §6. The register is a living artifact — Phase P1 verifies it adversarially.

**P4 update 2026-08-12** — verified live against production by `scripts/verify-live.mjs` (25/25 pass, 0 fail, 0 skip; report `verify-live-FINAL.json`). Moved **Missing → Implemented:** independence analysis v1 (§5.6, clustering bound into grounding + per-claim wedge output) · display eligibility / anti-laundering (§20, `warrantRegistry?op=eligibility` + embed re-check, round-trip proven: exact text → `eligible:true`) · capability cards (§18, `CapabilityCard` entity + `publishCalibration?op=capability_card`, symmetric §18.2 gate enforced in `githubPrVerify`) · service modes + breakers wired (§15, `ServiceModeEvent` append-only ledger, `driftAlert` mode/set_mode/check_indicators, mode stamped on responses and warrants) · dogfooding CI gate (§19.6, `.github/workflows/aether-dogfood.yml`, advisory per §18.2). Moved **Unsafe → Resolved:** the `2d7dccd` permissive-RLS workaround (strict `create`/`update` restored on `AnswerVersion`/`Inquiry`/`Warrant` after every sessionless writer moved to the service role; sessionless write path re-verified green under strict rules) · sessionless 500s on `prepareReview` and `verifyLedgerIntegrity` (now clean 401s).

**Found by running it, not reading it** (all fixed 2026-08-12, all now covered by tests):
- Model output reached `Warrant.premises` uncoerced → intermittent **500 on the public `verifyResponse`** when a model emitted a non-string claim. Fixed in `shared/claimShape.js`.
- `verifyAnswer` verified only the legacy signature, so every API/widget-path warrant — which carries only v2 fields — displayed as `signature_valid: false` on the **public proof surface**. A correct proof reading as forged is the inverse of the honesty law. Fixed; live scheme is now `Ed25519 (RFC 8785 v2)`.
- `CorrelationAudit.items` did not declare `class`/`caught`/`error`, so Base44 stripped them on write and **no stored run could ever qualify as a measurement** — the capability card was structurally incapable of becoming measured, and enforcing could never unlock. Schema fixed.
- `generateCardData` would have measured a *failed* run: the 2026-08-12 gate-2 run hit exhausted Base44 integration credits, and every errored TRUE claim reads naively as a 100% false-block rate. Errored runs are now skipped with the reason stated on the card.

**MEASURED 2026-08-12 — the credit blocker was a misdiagnosis.** The negative-control gate was believed blocked on Base44 integration credits until 2026-09-04. It was not: `llmRouter` swallowed every tier's error, so the only visible symptom was tier 3's "out of integration credits" while the real faults sat upstream. Making the router report each tier exposed the chain — (1) `CLAUDE_MODEL_MAP` pinned every identifier to `claude-3-5-sonnet-20241022`, an Oct-2024 build retired at Anthropic *and* at OpenRouter, killing both non-credit tiers; (2) a stale `temperature: 0.2` that current Claude models reject outright; (3) `callAnthropicJson` requiring the whole response to be JSON, discarding correct answers that carried a sentence of preamble; (4) `rawCall` reading only `content[0].text`, so a reply led by a non-text block read as empty. Fixed in `126bf15`, `6986586`, `bda2646`.

**First clean run — gate-0, `6a7c10a1c9c53d5692bc0214`, 30 items, 0 errors:** fabricated 10/10 · corrupted 10/10 · true 9/10 · **AUC 1.0** · accuracy 0.967 · separation 46 · gate **PASS**. Error progression across the three parser fixes: 30 → 11 → 0.

**The general-verify capability card now carries measured rates** (first time any card has): false-pass **0.0** at every tier, false-block **0.10** at every tier, `benchmark_refs: [6a7c10a1c9c53d5692bc0214]`. `CorrelationAudit` persistence verified: `ALL-CLASS: true`, 30 caught-flags, 0 errors.

**§18.2 remains LOCKED — correctly, and for two precisely-named reasons**, not for want of a run: `false_block_rate_by_risk.critical 0.1 exceeds the 0.05 threshold` and `extraction_recall is not measured`. One true claim in ten is still refused, which is above what a critical-risk hard block may cost. technical-docs@1.0 stays null (the wedge path has its own measurement, not yet run). No number was invented to force the unlock.

**EXTRACTION RECALL MEASURED 2026-08-12 — 0.4091, and it is the most important number on the card.** `shared/extractionRecall.js` + `shared/extractionGold-v1.js` (15 cases, 22 material claims) score the shipped deterministic extractor: **recall 0.4091 (9/22)**, **distinct_unit_rate 0.3182**. Deterministic and dependency-free, so it is recomputed on every card generation rather than stored and left to go stale. Two numbers by design — *recall* asks whether the assertion was captured at all, *distinct_unit_rate* whether it got its own verification unit; a compound sentence scores 1.0 and 0.0 respectively, and reporting only the first would flatter the extractor on exactly the case §6.3 names as its weak spot.

**The extractor finds fewer than half the material claims, and this is not a scorer artifact:** it returns *zero* claims for whole cases. Its `FACTUAL_PATTERNS` list has no entry matching "scored", "supports", or "kicks in"; a `length > 20` filter drops `Uptime was 99.99%.` outright; and `/\b\d+%\b/` can never match a percentage followed by a space (`%` and ` ` are both non-word, so the trailing `\b` fails) — a dead pattern that has been carrying no weight since it was written. Since everything downstream is conditional on extraction, this bounds every other quality number the verifier reports.

**A gate flaw the measurement exposed:** `enforcingAllowed` only checked whether `extraction_recall` *existed*, so 0.4091 would have satisfied it and unlocked that condition. Presence is not adequacy — a claim never extracted is never verified, never contradicted, and never blocked. Added `EXTRACTION_RECALL_MIN = 0.80`, stated in the open as a judgement because §6.3 names no number.

**EXTRACTOR FIXED AND RE-MEASURED, same day.** All three defects repaired, with a **precision** counterweight added to the scorer first — recall alone is trivially gamed by extracting every sentence, and every spurious claim is one more thing the gate can wrongly block, which would have pushed false-block *up* while the recall number looked better. The flat indicator list is replaced by tiered evidence: **STRONG** (quantities, money, dates, standards, fact-asserting verbs) is sufficient alone · **WEAK** (copulas, modals) needs length · **HEDGE** (`might`, `maybe`, `we think`, `we are proud`, questions) **vetoes regardless** — *"we think latency might drop by 40%"* carries a quantity but asserts nothing, and blocking on it would mean blocking a sentence that never made a claim.

| metric | before | after |
|---|---|---|
| recall | 0.4091 (9/22) | **0.9091 (20/22)** |
| precision | 0.6667 | **0.8000** |
| distinct_unit_rate | 0.3182 | **0.5909** |

Both directions improved. The two remaining misses are cross-sentence claims needing pronoun resolution (*"It was four times faster"*) — the honest ceiling for a sentence-level deterministic pass and precisely §6.3's model-path job. Two of the four counted "spurious" are those same claims captured without their context, so real precision is better than 0.80 rather than worse.

**§18.2 is now one refusal from unlocking:** `extraction_recall 0.9091` clears the 0.80 minimum, leaving only `false_block_rate_by_risk.critical 0.1 exceeds the 0.05 threshold`.

**Next work, in order:** (1) Drive critical-tier false-block from 0.10 to ≤0.05, **or** risk-stratify the negative-control corpus — it is currently unstratified, so a single aggregate is reported across all four tiers, which is both a stated card limitation and the reason a critical-tier threshold is being judged on general-tier evidence. (2) The model-extractor half of §6.3's dual path, for cross-sentence and compound claims (`distinct_unit_rate` 0.5909 means ~40% of claims still share a verdict with another claim). (3) Author annotations + the `compiler_miss` regression signal (§6.3), neither of which exists yet. Everything upstream of that measurement is fixed and tested. Also open: `streamVerify` warrants carry no `service_mode_at_issuance` (SSE shape, deliberate); `verifyResponse` reads `GroundingDoc` through the sessionless request client, which returns nothing under that entity's owner-scoped read RLS — grounding context is silently dropped on keyed API calls (pre-existing, unrelated to the RLS restoration).

- **Implemented:** tribunal (3-mode + red team + signing) · attest pipeline (decomposition, SSRF-guarded grounding, falsifier veto, coverage, calibration) · claim persistence + `/claims` UI · hash-chained Ed25519 audit ledger · `githubPrVerify` + `.aether/policy.yml` parser + commit status + inline annotations · Action v1 (score-threshold) · Python/JS SDKs · MCP worker (OAuth 2.1, SSE, SSRF guard, batch quota) · Chrome + desktop extensions · Claude skill · Slack/Teams alerting · red-team arena, benchmark, leaderboard, calibration, drift alerts · Stripe tiers · nightly backup with 0-record tripwire · multi-model compare matrix.
- **Partial:** warrants (signed; weak canonicalization §23.3; no Merkle log/inclusion proofs/key discovery) · public verification (`warrantApi` live; `verifyWarrantPublic` + verifier page pending) · public claims browser pending · GitHub connector scopes (`repo:status` only) · MCP claims tools pending · ledger-integrity endpoint/UI pending · extension hardening unverified against §22.1.
- **Missing:** evidence vault (snapshots-as-first-class + locators + structured applicability) · policy packs as versioned artifacts + change control · capability cards · semantic diff / display eligibility · independence analysis · memoization (§7.2) · missions · Forge (all) · Cosmos product surface · review workflow/quorum/dissent · incident taxonomy + regression pipeline · breakers wired to service modes · SLOs/DR formalized · decommissioning guarantees · reputation/credits · everything else marked [NEW].
- **Unsafe / at-risk:** server-side batch metering unconfirmed (50× multiplier) · server-side `webhookVerify` SSRF unverified · signing-input delimiter ambiguity · `SECURITY.md` placeholder · README benchmark overclaim · `aether-app-import` branch unmerged (two divergent lines).

---

## 29. Delivery phases and the first 90 days

Phases are gap-closure, not greenfield. Each phase's exit criteria are the gate to the next.

**P0 — Contracts freeze** (this document + small specs): vocabulary, state model (§3.2), warrant v2 schema, policy DSL v2 (aligned with shipped `policyParser.js`), threat model, reviewer rules, incident runbooks. *Exit:* every approval state mechanically defined; every critical failure has a safe state; every high-risk action has an accountable owner; every core object has a stable ID + audit event.

**P1 — Truth about ourselves** (≈ days 1–15): land/decide `aether-app-import` → `main` · adversarial verification of the Unsafe list (extension binding fixtures, server-side SSRF, server-side batch metering) · GitHub connector scopes · ledger-integrity endpoint + Trust Center panel · real `SECURITY.md` · README claim narrowing. *Exit:* the gap register is verified, not asserted; no known-Unsafe item remains unowned.

**P2 — Independently verifiable** (≈ days 16–35): RFC 8785 dual-sign migration · `/.well-known/aether-keys.json` · `verifyWarrantPublic` + proof page · public claims browser · **memoization v1 (§7.2)** · Flash-first tiered pipeline with published latency budgets · API v2 contract draft + MCP `search_claims`. *Exit:* an outsider verifies a warrant with no Aether UI; a repeat verification of unchanged content costs ~zero.

**P3 — The wedge becomes the product** (≈ days 36–60): evidence snapshots + locators + applicability v1 on the PR path · decision resolver replaces the raw score gate · **Action v2 ships advisory-by-default** · `technical-docs@1.0` formalized · review workflow v1 (low/moderate quorums + SLAs) · transparency log v1 (ledger → Merkle checkpoints) · PR UI polish (file grouping, gate banner, markdown export). *Exit:* an unsupported critical doc claim produces a claim-level annotation with evidence and a safe rewrite in ≤ 3 min p50 warm; review packets resolve in minutes; every verdict is reproducible from its warrant.

**P4 — Defensible** (≈ days 61–90) — **BUILT, LIVE, AND MEASURED 2026-08-12**: independence analysis v1 ✅ · semantic diff / display eligibility on proof pages + embeds ✅ · capability card v1 ✅ *mechanism* **and** ✅ *measurement* for `general-verify` (false-pass 0.0, false-block 0.10, from a clean 30-item run with 0 errors) — technical-docs@1.0 still unmeasured · drift indicators + breaker levels wired to service modes ✅ · dogfooding gate live in CI ✅ (advisory, needs the `AETHER_API_KEY` repo secret to execute) · benchmark program formalized ✅ (plumbing correct end-to-end **and** exercised: §28). *Exit status:* gate 10 (capability cards block in **both** directions) is now **demonstrated** — the card holds real false-pass and false-block numbers and the §18.2 gate refuses to unlock on them, citing `critical 0.1 > 0.05` and unmeasured `extraction_recall`. Enforcement stays advisory by the system's own arithmetic rather than for want of data, which is the behaviour §18.2 was written to produce. Remaining before enforcement can be offered: measured extraction recall (§6.3) and critical-tier false-block ≤ 0.05.

**P5 — Missions and Cosmos:** mission workspace (verify/resolve first) · dependency graph + blast-radius analysis · revalidation queue + storm control (§26.4) · Cosmos 2D lenses over live warrants. *Exit:* a source change lists affected artifacts, warrants, owners; every gap/conflict has a next action; hypotheses cannot appear as evidence.

**P6 — Forge Work Mode:** structured ingestion · system/claim map · evidence + timeline panels · Frontier Map · Aether verification handoff · `mechanical@1.0` pilot with mechanics/technical users · safe guided-test path. *Exit:* pilot users convert frontier items into missions; no hypothesis ever renders as proof.

**P7 — Economy and contributors:** private reputation · closed-loop credits · reviewer calibration + conflict controls · pilot bounties only after abuse controls and adjudication work · accountability bonds for public-reach publishing only. *Exit:* rewarded behavior list (§13) is live with anti-gaming controls measured.

**P8 — Enterprise Bridge and scale:** PDP with signed policy-decision tokens · SSO/SCIM/ABAC · residency controls · policy simulation · managed extension config · marketplace with strict review · tenant-managed keys · Forge Infinity Mode (only after Work Mode shows measured utility) · substrate rail migration option (§26.3) when the SF2X rent-rail lands. *Exit:* external systems verify warrants end-to-end without proprietary UI; integrations preserve policy, permissions, and lineage.

---

## 30. Metrics

**Adoption/velocity:** time from claim encounter to verification · first-verification completion · extension install-to-use · input mix (URL/screenshot/selection) · repeat verification + Forge return rate · proof-page share and verification rate · **PR gate wall-clock p50/p95 · verdict-reuse rate · tribunal invocations per PR**.
**Integrity:** critical false-pass rate · critical false-block rate · claim coverage rate · **extraction recall** · evidence alignment rate · citation integrity rate · qualifier recall · contradiction recall · **independence-adjusted corroboration quality** · freshness compliance · applicability completeness · scope-laundering detection · warrant expiry compliance · unknown-unknown rate.
**Accountability:** conflict-disclosure compliance · reviewer calibration · adjudication turnaround · appeal overturn rate · correction time (triage → containment → durable fix) · revalidation latency + completion · recurrence rate · regression escape rate · challenge validation rate · override rate + outcome quality · source-steward response time.
**Economics:** cost per verification (by tier) · cost per prevented material failure · **cost-breaker activations** · quota-rejection correctness.
**Forge:** frontier items → research tasks · hypotheses with safe experiment plans · experiments with reproducible observations · validated evidence candidates · time from unknown to next safe action.

---

## 31. Explicit deferrals (do not let these delay the core)

Transferable cryptocurrency/token markets · NFTs or blockchain framing for warrants · public high-stakes bounty markets · public employee reliability rankings · rewards for raw volume or controversy · autonomous real-world experimentation · broad medical/legal/financial advice · full federation before revocation + interop mature · AR/VR before Work Mode is exceptional · massive generic graphs before high-value workflows work · 3D before 2D earns it.

---

## 32. Ship / no-ship gates

Do not claim broad AI-trust leadership until **all** are true:

1. Independent warrant verification works offline (CLI + keys endpoint).
2. Warrants bind to immutable artifact, policy, protocol, model provenance, and capability card.
3. Evidence snapshots, quotes, and locators are preserved; material claims carry applicability checks.
4. Critical claims fail closed when required evidence is missing; injection indicators cap verdicts.
5. Independence analysis runs on material corroboration.
6. Human review has separation of duties, quorums, SLAs, and preserved dissent; overrides expire and are auditable.
7. Source/policy changes trigger revalidation; storms degrade visibly, never silently.
8. Hypotheses cannot contaminate supported evidence (namespace + firewall proven by test).
9. Cross-tenant authorization, prompt-injection, retrieval-poisoning, and supply-chain suites pass.
10. Capability cards block unvalidated automatic decisions — **in both directions** (false-pass and false-block measured).
11. Confirmed failures create regression fixtures; degraded modes are visible and safe.
12. Export and offline verification work as tested operational procedures.
13. **Velocity gate:** median warm PR verification meets the published latency budget; verdict-reuse rate is measured and reported.
14. **Dogfooding gate:** Aether's own README and docs pass Aether in CI; its public benchmark claims carry n + methodology.
15. Marketing is limited to demonstrated, domain-specific performance.

---

## 33. Final operating standard

Aether earns the right to be called an accountability layer only when it can answer, immediately and inspectably:

> What exact claim did you evaluate? What preserved evidence supports or contradicts it — and which of those sources are independent? Does that evidence apply here? Which policy, protocol, model, and capability card governed the result? Who reviewed it, what dissent existed, and who accepted residual risk? How long is it valid, and what source, policy, model, or dependency change would invalidate it? What decisions and artifacts are affected if it fails? How can a third party verify the record without trusting our UI? What did it cost, how fast was it, and how does the system improve when it is wrong?

Forge adds the frontier question:

> Where does established knowledge end, what constraint or contradiction defines the frontier, and what is the smallest safe test that can move it?

> Aether does not promise that AI will never be wrong.
> Aether makes consequential AI claims difficult to be wrong **silently** — at a speed and cost that make the safe path the default path.
