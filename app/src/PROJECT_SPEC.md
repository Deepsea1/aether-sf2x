# Aether — Complete Project Specification

> **Mission:** The Truth Layer for AI — verifiable warrant-based provenance, real-time hallucination detection, and claim-level auditability for any LLM conversation.
>
> **Stack:** React + Tailwind CSS + JavaScript on Vite, Base44 BaaS (auth, database, integrations, hosting). Backend functions in TypeScript (Deno runtime). Shared logic in `base44/shared/`.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Entity Catalog (29)](#2-entity-catalog)
3. [Backend Functions (47)](#3-backend-functions)
4. [Workflows / Automations (14)](#4-workflows--automations)
5. [In-App Agents (4)](#5-in-app-agents)
6. [Pages & Routes (70+)](#6-pages--routes)
7. [Shared Modules](#7-shared-modules)
8. [Frontend Components](#8-frontend-components)
9. [Secrets & Environment](#9-secrets--environment)
10. [Connectors](#10-connectors)
11. [Stripe Billing](#11-stripe-billing)
12. [SDKs, Embeds & Distribution](#12-sdks-embeds--distribution)
13. [MCP Server](#13-mcp-server)
14. [RLS Patterns](#14-rls-patterns)
15. [Credit-Saving Architecture](#15-credit-saving-architecture)
16. [Remaining Build Work](#16-remaining-build-work)

---

## 1. Architecture Overview

### Core Pipeline Flow
```
User Prompt → Inquiry entity
  → Stakes gating:
      low      → Single-model warranted answer (1 LLM call)
      medium   → Fast 2-model tribunal (5 LLM calls, ~55% cheaper)
      high+    → Full 3-model tribunal (10+ LLM calls)
        1. 3 models answer independently (parallel)
        2. Each cross-examined by a different lab (parallel)
        3. Each author reconciles (parallel)
        4. Cross-firm verifier ranks + merges
        5. Hardened answer attested via web-grounded verification
        6. Red-team stress test (mandatory default stage)
  → AnswerVersion + Warrant (signed, Ed25519)
  → Claim + EvidencePack persistence (claim-level auditability)
  → AuditLog (hash-chained ledger entry)
  → Telemetry span
```

### Multi-Tenant Isolation
Every entity that stores customer data has a `tenant_id` or `customer_id` or `user_id` field, with RLS rules that restrict reads to the owner or admins. The `Inquiry.customer_id` and `ApiKey.user_id` are the primary tenant boundaries.

### Trust Scoring
```
rawTrust = supportRatio × 100 × (0.6 + 0.4 × verifierConfidence)
trust = calibrateTrust(rawTrust, domain)  // domain-aware adjustment
// Gate 1: source grounding tiers (T1=1.0, T2=0.8, T3=0.5, T4=0.2)
// Gate 2: falsifier veto + coverage check (detectability)
// Gate 3: cross-firm verification + authoritative grounding penalty
```

### Warrant Signing
```
signed_hash = Ed25519_sign(
  [answerVersion.id, answerText, premises.join(';;'), sources.join(';;')].join('|'),
  ED25519_PRIVATE_KEY
)
// Fallback: HMAC-SHA256 with sf2x_attestation_key
// Source snapshots: SHA-256 hash of each cited source's fetched content
// Policy hash: SHA-256 of canonical policy content
// AuditLog: hash-chained (previous_event_hash → event_hash → Ed25519 signature)
```

---

## 2. Entity Catalog

All schemas live in `base44/entities/<Name>.jsonc`. Built-in fields on every record: `id`, `created_date`, `updated_date`, `created_by_id`.

### Core Verification Entities

#### Inquiry
The submitted question/prompt. Primary tenant boundary via `customer_id`.
| Field | Type | Description |
|-------|------|-------------|
| prompt | string (required) | The submitted question |
| domain | string | Medicine, Finance, Legal, HR, Engineering, Science, General |
| stakes_level | enum | low, medium, high, critical (default: medium) |
| status | enum | thinking, answered, review, failed |
| customer_id | string | Owning customer (app user) — tenant isolation key |
| ip_hash | string | Hashed IP for anonymous rate limiting |
| grounding_doc_ids | string[] | GroundingDoc ids used to ground this inquiry |
| validated_answer | string | Tribunal-validated answer summary from escalation |

#### AnswerVersion
A versioned answer to an inquiry. Multiple versions per inquiry (corrections create new versions).
| Field | Type | Description |
|-------|------|-------------|
| inquiry_id | string (required) | Parent inquiry |
| version | number | Sequential version number |
| answer_text | string (required) | The warranted answer |
| cognitive_state | object | Working memory, self-model, reasoning trace, model info |
| metrics | object | CE, ECE, UCR, FRR, CR, MTTC, EDS, resistance_rate |
| warrant_id | string | Reference to the Warrant |
| trust_score | number | 0-100, computed at creation |
| stakes_level | enum | Denormalized for escalation triggers |

#### Warrant
The cryptographic warrant backing an answer version. Contains the full verification breakdown.
| Field | Type | Description |
|-------|------|-------------|
| answer_version_id | string (required) | The AnswerVersion this backs |
| premises | string[] | Explicit premises the conclusion depends on |
| conclusion | string (required) | The warranted conclusion |
| claims | object[] | Per-claim breakdown: claim, supported, confidence, note, authoritative_grounding |
| issues | string[] | Verifier-flagged issues |
| support_confidence | number | Confidence claims are SUPPORTED by evidence |
| detectability_confidence | number | Confidence a falsehood would be DETECTED |
| falsification | object | Gate 2 falsifier result: strength, argument, load_bearing_claim, vendor, cross_firm |
| roles | object[] | Per-role model provenance: role, model_family, vendor |
| confidence_score | number | Top-level 0-1 |
| validity_status | enum | valid, weak, invalid, insufficient_evidence, contested, expired |
| expiry_date | date-time | When premises should be revalidated |
| sources | string[] | Cited source URLs |
| authoritative_grounding | object | Domain-authoritative source summary + penalty |
| grounding_notes | string | Verifier's assessment of source authority |
| source_snapshots | object[] | Preserved evidence: url, fetched_at, status, content_hash, content_length |
| corroboration | object | Source triangulation from multi-model tribunal |
| signed_hash | string | Ed25519 signature artifact |

#### Claim
A discrete, testable assertion extracted from an answer, PR diff, or document.
| Field | Type | Description |
|-------|------|-------------|
| text | string (required) | Full claim text |
| claim_id_ref | string | External-style reference id (clm_...) |
| category | enum | benchmark, security, financial, legal, medical, marketing, technical, factual, historical, general |
| subject | string | What the claim is about |
| predicate | string | Relationship/action asserted |
| object | string | Value/target asserted |
| time_scope | string | Temporal scope if time-bounded |
| jurisdiction | string | Legal/regulatory jurisdiction |
| risk_level | enum | low, medium, high, critical |
| extraction_confidence | number | 0-1 confidence in extraction |
| source_asset_type | enum | answer_version, pr_diff, markdown, document, api_submission, manual |
| source_asset_id | string | Id of source asset |
| source_excerpt | string | Surrounding text for context |
| flash_signals | object[] | Aether Flash deterministic risk signals |
| verdict_status | enum | pending, supported, supported_with_limits, mixed, unsupported, contradicted, unverifiable, out_of_scope |
| verdict_confidence | number | 0-1 |
| coverage_state | enum | unverified, sampled, partial, high_coverage, complete |
| policy_decision | enum | pending, allow, warn, require_review, block |
| evidence_pack_id | string | Linked EvidencePack |
| warrant_id | string | Linked Warrant |
| tenant_id | string | Tenant isolation |

#### EvidencePack
The evidence backing a single claim's verdict.
| Field | Type | Description |
|-------|------|-------------|
| claim_id | string (required) | The Claim this backs |
| sources | object[] | All evaluated sources: url, publisher, author, capture_time, source_version, content_hash, authority_tier, freshness_days, freshness_status, retraction_status, quarantined, quarantine_reason |
| supporting_excerpts | object[] | source_url, excerpt, match_score |
| conflicting_excerpts | object[] | source_url, excerpt, match_score |
| source_authority_summary | enum | primary_authoritative, primary_operational, qualified_secondary, unverified_secondary, user_supplied, mixed |
| freshness_summary | enum | current, stale, mixed, unknown |
| coverage | enum | complete, high_coverage, partial, sampled, unverified |
| limitations | string[] | Stated evidence limitations |
| manifest_hash | string | SHA-256 of canonical evidence manifest |

### Governance Entities

#### AuditLog
Hash-chained, tamper-evident governance ledger.
| Field | Type | Description |
|-------|------|-------------|
| event_type | enum (30 values) | inquiry_created, answer_promoted, correction_logged, gate_decision, review_decision, kill_switch, drift_alert, claim_extracted, evidence_quarantined, policy_checked, policy_blocked, policy_allowed, warrant_issued, warrant_verified, warrant_revoked, warrant_superseded, evidence_added, evidence_removed, review_opened, review_updated, review_resolved, gate_checked, gate_passed, gate_failed, export_created, export_verified, incident_opened, incident_updated, incident_resolved, key_rotated, connector_permission_changed |
| entity_type | string | Kind of entity concerned |
| entity_id | string | Id of entity concerned |
| actor_id | string | Who/what triggered it |
| tenant_id | string | Tenant isolation |
| trace_id | string | Links to Telemetry trace |
| summary | string (required) | Human-readable summary |
| metadata | object | Structured payload |
| previous_event_hash | string | SHA-256 of previous event in chain |
| event_hash | string | SHA-256 of this event's canonical content |
| signature | string | Ed25519 signature over event_hash |
| chain_integrity | boolean | True when hash chain validates |

#### Policy
Repository security policies parsed from `.aether/policy.yml`.
| Field | Type | Description |
|-------|------|-------------|
| policy_id | string (required) | Human-readable id |
| version | number | Monotonically increasing |
| effective_at | date-time | When this version becomes active |
| default_action | enum | allow, warn, require_review, block, ignore |
| rules | object[] | Ordered rules: category, action, min_evidence_tier, freshness_days, require_warrant |
| release_gate | object | block_on[], require_review_on[] |
| source_yaml | string | Raw .aether/policy.yml source |
| source_type | enum | repository, manual, system_default |
| source_repo | string | GitHub repo (owner/repo) |
| status | enum | draft, active, simulated, superseded, retired |
| policy_hash | string | SHA-256 of canonical content |
| simulation_result | object | affected_prs, expected_blocks, expected_warnings, review_burden, simulated_at |

#### AISystem
A governed AI system/deployment.
| Field | Type | Description |
|-------|------|-------------|
| name | string (required) | System name |
| owner | string | Named owner |
| purpose | string | Documented purpose |
| domain | string | Knowledge/operational domain |
| risk_tier | enum | low, medium, high, regulated |
| lifecycle_state | enum | draft, evaluated, approved, monitored, degraded, suspended, retired |
| evaluation_summary | string | Latest evaluation |
| release_gates | object | Checklist: named_owner, documented_purpose, evaluation_summary, review_completion, risk_signoff, rollback_criteria |
| monitoring | object | Drift: performance, trust, policy_violations, review_backlog, evidence_freshness, correction_speed |

#### Review
Human-in-the-loop review queue item.
| Field | Type | Description |
|-------|------|-------------|
| answer_version_id | string (required) | Under review |
| inquiry_id | string (required) | Parent inquiry |
| capability_level | string | Gate level (L3, etc.) |
| status | enum | pending, approved, rejected, flagged, killed |
| reviewer_id | string | Who decided |
| decision | string | Human-readable decision |
| notes | string | Reviewer notes |
| decided_date | date-time | When decided |
| verdict | object | Auto-test result: consensus, confidence, verifier verdict, corrections, recommended action |
| candidate_version_id | string | Better answer prepared by auto-test |

#### Debate
Tribunal debate trace (proposer/critic/verifier per model).
| Field | Type | Description |
|-------|------|-------------|
| inquiry_id | string (required) | Parent inquiry |
| answer_version_id | string (required) | Proposer answer |
| proposer | object | stance, reasoning, model, phase, correctness, winner |
| critic | object | objections, risks, verdict, model |
| verifier | object | verdict, corrections, reconciled_answer, model |
| consensus | enum | agreed, contested, rejected |
| verdict_confidence | number | 0-1 |
| minority_report | string | Dissenting view |

#### CorrectionEvent
Tracks when an answer is corrected (new version supersedes old).
| Field | Type | Description |
|-------|------|-------------|
| inquiry_id | string (required) | Parent inquiry |
| from_version_id | string | Being corrected |
| to_version_id | string (required) | The correction |
| from_version / to_version | number | Version numbers |
| severity | enum | minor, moderate, major, critical |
| detected_by | enum | self, user, reviewer, drift_detector |
| time_to_correction | number | Seconds (MTTC) |
| trust_delta | number | Trust score change |
| drift_score | number | Composite drift 0-1 |

#### RedTeamRun
Adversarial attack result.
| Field | Type | Description |
|-------|------|-------------|
| target_id | string (required) | Answer version under attack |
| inquiry_id | string | Parent inquiry |
| attack_vector | enum | prompt_injection, authority_fabrication, premise_inversion, scope_creep, temporal_drift, evasion |
| attack_prompt | string | The adversarial prompt |
| response_text | string | System response |
| outcome | enum | resisted, wobbled, broken |
| severity | enum | none, low, moderate, high, critical |
| trust_after | number | Trust score post-attack |

### Observability Entities

#### Telemetry
Distributed tracing for every request/workflow.
| Field | Type | Description |
|-------|------|-------------|
| trace_id | string (required) | Groups all spans in a request |
| span_id | string | Unique span id |
| parent_span_id | string | For nested traces |
| event_type | enum (29 values) | request_received, prompt_received, model_started, model_completed, model_failed, retrieval_started, retrieval_completed, tool_called, tool_completed, policy_checked, policy_blocked, policy_allowed, review_opened, review_updated, review_resolved, provenance_signed, provenance_verified, provenance_revoked, gate_checked, gate_passed, gate_failed, export_created, export_verified, incident_opened, incident_updated, incident_resolved, drift_detected, alert_triggered |
| span_type | enum | operation, model_call, retrieval, tool_call, policy_check, review, provenance, export, gate_check |
| group | enum | identity, prompt, model, retrieval, tool, governance, evaluation, review, provenance, performance, drift, export_pack |
| severity | enum | info, warn, error |
| linked_entity_type | string | Entity kind concerned |
| linked_entity_id | string | Entity id |
| context | object | Full grouped payload |

#### UserEvent
Fine-grained per-user action log for auditing.
| Field | Type | Description |
|-------|------|-------------|
| user_id | string (required) | App user |
| event_type | enum | inquiry, verify, attest, gate, review, correction, drift, other |
| trust_score | number | At event time |
| verdict | string | verified, contested, rejected, allow, suppress, escalate, etc. |
| domain | string | |
| stakes | string | |
| source | string | console, api, extension, widget, batch, workflow |
| linked_entity_type/id | string | Linked entity |
| metadata | object | Extra context |

#### UserMetrics
Rollup metrics per app user.
| Field | Type | Description |
|-------|------|-------------|
| user_id | string (required) | App user |
| total_inquiries | number | Lifetime count |
| total_verifications | number | verify + attest count |
| total_gates / total_reviews | number | |
| mean_trust | number | 0-100 |
| contested_rate | number | 0-1 |
| rejected_count | number | |
| api_credits_used / api_credits_this_month | number | |
| last_active_date | date-time | |
| domain_counts / event_counts | object | {key: count} distributions |

### API & Billing Entities

#### ApiKey
Customer API keys for programmatic access.
| Field | Type | Description |
|-------|------|-------------|
| key | string (required) | Token (sk_sf2x_...) |
| user_id | string (required) | Owning customer |
| label | string | Optional label |
| active | boolean | default: true |
| expiry_date | date-time | Optional auto-expiry |
| expiry_notified_at | date-time | Internal flag for 7-day warning |

#### ApiUsage
Per-call credit metering.
| Field | Type | Description |
|-------|------|-------------|
| api_key_id | string | Key used |
| user_id | string (required) | Owning customer |
| endpoint | string (required) | warrantApi, gateApi, inquire |
| credits | number (required) | attest=5, gate=1, inquire=10 |
| month | string (required) | YYYY-MM for monthly reset |
| metadata | object | model_label, domain, lineage_id |

#### Subscription
Stripe subscription mirror.
| Field | Type | Description |
|-------|------|-------------|
| user_id | string (required) | Owning app user |
| email | string | Customer email |
| stripe_customer_id | string | |
| stripe_subscription_id | string | |
| plan | string | starter, pro, enterprise, etc. |
| status | enum | active, past_due, canceled, trialing |
| seats | number | default: 1 |
| current_period_end | date-time | |

### Knowledge & Grounding Entities

#### GroundingDoc
Authoritative documents that claims are checked against.
| Field | Type | Description |
|-------|------|-------------|
| name | string (required) | Document title |
| domain | string | Medicine, Legal, HR, Finance, Engineering, general |
| content | string | Authoritative text (cap ~8000 chars) |
| file_url | string | For larger documents |
| active | boolean | default: true |
| source | string | manual, upload, url |

### Benchmark & Calibration Entities

#### CalibrationReport
Trust score calibration against ground-truth corpora.
| Field | Type | Description |
|-------|------|-------------|
| corpus_version | string (required) | e.g. v2 |
| corpus_size | number (required) | Number of claims |
| last_run_date | date-time | |
| brier | number (required) | Mean((trust/100 - truth_label)²) |
| buckets | object[] (required) | Per-confidence-bucket: range, n, mean_predicted, mean_actual, accuracy, suppressed |
| catch_rates | object (required) | TRUE/FABRICATED/CORRUPTED pass rates + abstention |
| model_provenance | object[] | role, vendor, model |
| regression | boolean | True if FABRICATED catch dropped >10% or Brier increased >0.05 |
| grounded | boolean | Whether grounding pipeline was live |
| cross_firm | boolean | Whether foreign-vendor falsifier ran |

#### BenchResult
Composite system benchmark scores.
| Field | Type | Description |
|-------|------|-------------|
| system_name | string (required) | System scored |
| domain | string | |
| warrant_rate | number | Fraction with valid warrant, 0-1 |
| trustworthy_rate | number | Mean trustworthy rate, 0-100 |
| correction_rate | number | |
| mean_time_to_correction | number | |
| resistance_rate | number | Red-team attacks resisted, 0-1 |
| drift_score | number | |
| bench_score | number | Composite 0-100 |
| certified | boolean | |

#### ModelBenchRun
Per-model-per-question benchmark result (the Bench data source).
| Field | Type | Description |
|-------|------|-------------|
| question | string (required) | Benchmark question |
| question_date | string | YYYY-MM-DD for daily grouping |
| model | string (required) | Model identifier |
| model_label | string | Human-readable name |
| answer_text | string | Model's answer |
| trust_score | number | 0-100 |
| correctness | number | Verifier-judged 0-1 |
| is_winner | boolean | Tied for top correctness |
| metrics | object | Epistemic metric snapshot |
| warrant_summary | object | validity, confidence, premises count, sources count |
| latency_ms | number | Response latency |
| run_type | enum | manual, daily, tribunal |
| verifier_notes | string | Rationale for correctness |
| error | string | If model failed |

#### TribunalLiftAudit
Measures how much the tribunal improves trust/correctness vs single-model.
| Field | Type | Description |
|-------|------|-------------|
| n_questions | number (required) | Questions both paths answered |
| mean_trust_single / mean_trust_tribunal | number | Mean SF2X trust |
| trust_lift | number (required) | tribunal - single |
| mean_correctness_single / mean_correctness_tribunal | number | Judge correctness 0-1 |
| correctness_lift | number (required) | tribunal - single |
| tribunal_win_rate | number | Fraction tribunal strictly better |
| tie_rate | number | Fraction equal |
| items | object[] | Per-question: question, correct_answer, trust/correctness for each path |
| run_type | enum | manual, scheduled |

#### CorrelationAudit
Validates trust score correlation with ground truth.
| Field | Type | Description |
|-------|------|-------------|
| dataset | string (required) | e.g. TruthfulQA-representative |
| n_items | number (required) | |
| n_true / n_hallucinated | number | Ground truth split |
| pearson_r | number (required) | Trust vs truth label |
| spearman_rho | number | Rank correlation |
| auc | number | ROC AUC |
| accuracy | number | At threshold |
| threshold | number | Trust threshold used |
| mean_trust_true / mean_trust_false | number | |
| separation | number | true - false |
| items | object[] | Per-item results |
| run_type | enum | manual, scheduled |

#### VerificationHistory
Lightweight verification log (public-facing).
| Field | Type | Description |
|-------|------|-------------|
| trust_score | number (required) | 0-100 |
| verdict | enum (required) | verified, contested, rejected |
| text_preview | string | Max 500 chars |
| source | string | api, widget, extension, playground, batch |
| category | string | HR, Legal, Medicine, Engineering, General |

### Marketing Entities

#### NewsletterSignup / NewsletterSubscriber
Email subscribers for the Weekly AI Hallucination Report.
| Field | Type | Description |
|-------|------|-------------|
| email | string (required) | Subscriber email |
| source | string | landing, footer, api-docs |
| status | enum | subscribed, unsubscribed (Subscriber only) |

#### WebhookConfig
Outbound webhook destinations for governance events.
| Field | Type | Description |
|-------|------|-------------|
| label | string | Friendly name |
| url | string (required) | Endpoint URL |
| events | string[] | gate.suppress, gate.escalate, drift.alert, review.opened, verify.rejected |
| active | boolean | default: true |
| kind | enum | slack, pagerduty, custom |
| secret | string | Shared secret for X-Aether-Signature header |

---

## 3. Backend Functions

All in `base44/functions/<name>/entry.ts`. Deno runtime, TypeScript.

### Inquiry & Verification
| Function | Description |
|----------|-------------|
| `inquire` | Legacy single-model inquiry entry point |
| `inquireTribunal` | **Main console pipeline** — 3-mode (single/fast/tribunal) with cross-examination, reconciliation, cross-firm verification, red-team, warrant signing, claim persistence |
| `verifyAnswer` | Verify a submitted answer (standalone) |
| `verifyResponse` | Verify a response object |
| `verifyBatch` | Batch verify multiple answers |
| `batchWarrant` | Batch warrant attestation |
| `streamVerify` | Streaming verification (progressive results) |
| `warrantApi` | **Inbound warrant API** — attest an external answer, returns signed warrant + verdict |
| `warrantRegistry` | Warrant registry lookup/verification |
| `gateApi` | Policy gate API — check an answer against active policies |
| `revalidateWarrant` | Re-validate an existing warrant (re-fetch sources, re-check) |
| `generateEvidencePack` | Generate an evidence pack for a claim |

### GitHub Integration
| Function | Description |
|----------|-------------|
| `githubPrVerify` | **PR verification** — extract claims from diff, Aether Flash scan, policy eval, commit status, inline PR review annotations |
| `githubStatusCheck` | Post a commit status based on trust score |

### Governance & Escalation
| Function | Description |
|-------------|-------------|
| `escalateToTribunal` | Escalate a low-trust inquiry to full tribunal |
| `prepareReview` | Prepare a review item with auto-test results |
| `debateAndValidateCorrection` | Debate-validate a proposed correction |
| `driftAlert` | Trigger a drift alert |
| `notifySecurityTeam` | Notify security team of an incident |

### Benchmarking & Evaluation
| Function | Description |
|----------|-------------|
| `runModelBench` | Run a model benchmark (daily question) |
| `runSystemEval` | Evaluate a single AI system |
| `runSystemEvalSweep` | Full system evaluation sweep |
| `runNegativeControls` | Run negative control tests |
| `runSecurityRedTeam` | Run security red-team attack |
| `runCorrelationAudit` | Run trust/truth correlation audit |
| `runTribunalLiftAudit` | Run tribunal vs single-model lift audit |
| `postDailyArenaResult` | Post daily arena benchmark result |
| `trustScore` | Compute trust score for an answer |
| `trustScorecard` | Generate a trust scorecard for a system |
| `publishCalibration` | Publish a calibration report |

### User & API Management
| Function | Description |
|----------|-------------|
| `generateApiKey` | Generate a new API key |
| `refreshUserMetrics` | Refresh user rollup metrics |
| `keyExpirySweep` | Sweep for expiring API keys |
| `deleteAccount` | Delete user account + data |

### Billing & Subscriptions
| Function | Description |
|----------|-------------|
| `createCheckout` | Create Stripe checkout session |
| `stripeWebhook` | Handle Stripe webhooks |
| `cancelSubscription` | Cancel a subscription |
| `cancelUnpaidSubscription` | Cancel unpaid subscription after dunning |

### Email & Notifications
| Function | Description |
|----------|-------------|
| `sendSubscriberWelcome` | Welcome email for new subscribers |
| `sendInsightsDigest` | Weekly insights digest email |
| `sendDunningEmail` | Dunning email for unpaid subscriptions |
| `sendDiscountOffer` | Discount offer email |
| `sendUpgradeEmail` | Upgrade encouragement email |

### Exports
| Function | Description |
|----------|-------------|
| `exportAuditToSheets` | Export audit log to Google Sheets |
| `exportBenchToSheets` | Export benchmark data to Google Sheets |
| `weeklyAuditExport` | Weekly audit export job |

### Utility
| Function | Description |
|----------|-------------|
| `wrapDemo` | Wrap a demo request |

---

## 4. Workflows / Automations

All in `base44/workflows/<Name>.jsonc`. CNCF SWF format.

| Workflow | Trigger | Description |
|----------|---------|-------------|
| Critical Answer Tribunal Review | entity (Inquiry created, high/critical stakes) | Auto-escalates high-stakes inquiries to full tribunal |
| High-Risk Inquiry Security Check | entity (Inquiry created, security domain) | Runs security red-team on high-risk inquiries |
| Correction Validation Debate | entity (CorrectionEvent created) | Debates whether a correction is valid before promoting |
| Grounding Doc Review | entity (Inquiry updated, low trust) | Opens a grounding doc review when inquiry scores low |
| Model Drift Alert | scheduled | Checks for model drift, triggers alerts |
| Daily Model Arena | scheduled (daily) | Runs the daily model benchmark question |
| System Eval Sweep | scheduled | Runs full system evaluation sweep |
| Nightly Audit Export | scheduled (nightly) | Exports audit log |
| Weekly Audit Export | scheduled (weekly) | Weekly audit export to Sheets |
| User Metrics Refresh | scheduled | Refreshes all user rollup metrics |
| Key Expiry Guard | scheduled | Warns 7 days before API key expiry, auto-revokes on expiry |
| Subscriber Drip Campaign | scheduled | Subscriber email drip sequence |
| Unpaid Subscription Dunning | scheduled | Dunning sequence for unpaid subscriptions |
| Negative Control Gate | scheduled | Runs negative control tests as a release gate |

---

## 5. In-App Agents

Config files in `base44/agents/<name>.jsonc`.

| Agent | Description |
|-------|-------------|
| `tribunal_lift_audit_assistant` | Helps analyze tribunal lift audit results — explains why the tribunal improves (or doesn't) trust/correctness |
| `verification_history_assistant` | Helps users explore their verification history — trends, patterns, anomalies |
| `correction_event_explainer` | Explains correction events — what was wrong, what changed, why |
| `integration_support` | Helps users with integration questions — API, SDK, webhook setup |

---

## 6. Pages & Routes

From `src/App.jsx`. Code-split via `React.lazy`.

### Public Routes (no auth required)
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Public landing page |
| `/login` | Login | Email+password, Google OAuth, forgot link |
| `/register` | Register | Email+password+confirm, Google, register→OTP→verify |
| `/forgot-password` | ForgotPassword | Email → reset link |
| `/reset-password` | ResetPassword | `?token=` + new password |
| `/oauth/consent` | OAuthConsent | OAuth consent screen |
| `/pricing` | Pricing | Subscription tiers + API access |
| `/api-docs` | ApiDocs | API documentation |
| `/mcp` | McpServer | MCP server setup guide |
| `/verify/:id` | Verify | Public verification proof page |
| `/leaderboard` | Showcase | Model leaderboard (tabbed: Leaderboard, Benchmark, Compare, Multi-Model, Arena, Hall of Fame) |
| `/benchmark` | Benchmark | Benchmark detail |
| `/playground` | Playground | Try verification |
| `/badge/:id` | Badge | Embeddable trust badge |
| `/about` | About | Company info |
| `/contact` | Contact | Contact form |
| `/warrant-spec` | WarrantSpec | Warrant specification |
| `/scorecard/:id` | Scorecard | System scorecard |
| `/embed` | Embed | Embed widget setup |
| `/embed/badge/:id` | EmbedBadge | Embeddable badge |
| `/registry` | Registry | Model registry |
| `/methodology` | Methodology | Scoring methodology |
| `/extension` | Extension | Browser extension |
| `/hall-of-fame` | HallOfFame | Red-team hall of fame |
| `/compare` | Compare | Model comparison |
| `/arena` | RedTeamArena | Red-team arena |
| `/multi-model` | MultiModelCompare | Multi-model comparison |
| `/github-action` | GitHubAction | GitHub Action setup |
| `/github-pr-verify` | GitHubPrVerify | PR verification tool |
| `/terms` | Terms | Terms of service |
| `/privacy` | Privacy | Privacy policy |
| `/competitive-matrix` | CompetitiveMatrix | vs competitors |
| `/why-aether` | WhyAether | Why Aether |
| `/moat` | MoatAnalysis | Moat analysis |
| `/roadmap` | Roadmap | Product roadmap |
| `/monthly-report` | MonthlyReport | Monthly report |
| `/warrant-verifier` | WarrantVerifier | Public warrant verification |
| `/fast-path` | FastPath | Aether Flash fast path demo |
| `/pitch` | PitchDeck | Pitch deck |
| `/domain-benchmarks` | DomainBenchmarks | Domain-specific benchmarks |
| `/enterprise-integrations` | EnterpriseIntegrations | Enterprise integration options |

### Protected Routes (auth required)
| Route | Page | Description |
|-------|------|-------------|
| `/console` | AskHub | Main console — ask questions, get tribunal-verified answers |
| `/setup` | GettingStarted | Onboarding checklist |
| `/health` | Health | Epistemic health dashboard — 30-day trends |
| `/governance` | Governance | Review queue + audit archive |
| `/collective` | Collective | Red-team collective |
| `/bench` | Bench | Model benchmark dashboard |
| `/bench/model/:model` | ModelProfile | Per-model profile + history |
| `/drift` | ModelDrift | Model drift monitoring |
| `/lineage` | Lineage | Provenance lineage viewer |
| `/systems` | Systems | AI system governance registry |
| `/trust-center` | TrustCenterHub | Trust center hub |
| `/portal` | PortalHub | Account portal hub |
| `/guide` | Guide | Feature guide |
| `/upgrade` | UpgradeQueue | Upgrade queue |
| `/enterprise` | Enterprise | Enterprise features |
| `/telemetry` | Telemetry | Telemetry explorer |
| `/report` | Report | Report generator |
| `/grounding` | Grounding | Grounding doc management |
| `/analytics` | Analytics | Analytics dashboard |
| `/integrations` | Integrations | Integration settings |
| `/sdk` | Sdk | SDK documentation |
| `/batch` | Batch | Batch verification |
| `/evidence` | Evidence | Evidence explorer |
| `/api-usage` | ApiUsage | API usage + credits |
| `/developer-keys` | DeveloperKeys | API key management |
| `/verification-history` | VerificationHistory | Verification history |
| `/cost-analysis` | CostAnalysis | Cost analysis |
| `/subscribers` | Subscribers | Newsletter subscriber management |
| `/owner` | OwnerDashboard | Admin dashboard (tabs: Governance, Systems, API Keys, Settings, Subscribers) |
| `/tribunal-lift` | TribunalLiftAssistant | Tribunal lift analysis assistant |
| `/correction-explainer` | CorrectionExplainer | Correction event explainer |
| `/verification-assistant` | VerificationHistoryAssistant | Verification history assistant |
| `/integration-support` | IntegrationSupport | Integration support |
| `/developer` | DeveloperHub | Developer hub |
| `/claims` | Claims | Claims & evidence registry browser |

### 404
`*` → PageNotFound

---

## 7. Shared Modules

All in `base44/shared/`. Imported by backend functions via relative path.

| Module | Purpose |
|--------|---------|
| `sf2xCore.js` | Prompt building (`buildThinkPrompt`), trust calculation (`computeTrustworthyRate`), Ed25519/HMAC signing (`generateSignature`), JSON schemas (`THINK_JSON_SCHEMA`) |
| `attest.js` | Attestation pipeline — `runVerification()`, `runVerificationEnsemble()`, `attestAnswer()`, source grounding (`groundSources`, `snapshotSources`), SSRF guard (`assertSafeSourceUrl`), DNS-over-HTTPS resolution, source tiering (`SOURCE_TIERS`, `tierForSource`) |
| `sf2xTribunal.js` | Multi-model tribunal — model routing (`resolveTrio`, `resolveDuo`, `pickCritiqueModel`, `pickVerifiers`), prompt builders (`buildCritiquePrompt`, `buildReconcilePrompt`, `buildMergePrompt`, `buildFastMergePrompt`), LLM callers (`callAnswerer`, `callCritique`, `callReconcile`, `callVerifier`), corroboration (`corroboratingSources`), model label/family helpers, `NATIVE_TO_OR` mapping |
| `claimPersistence.js` | `persistClaimsAndEvidence()` — bridges verification output → Claim + EvidencePack entities with manifest hashing + audit log |
| `claimExtractor.js` | `extractClaims()`, `extractClaimsFromDiff()` — deterministic, sentence-based claim extraction with file/line tracking for PR diffs |
| `aetherFlash.js` | `flashScan()` — deterministic regex-based risk scanner (zero LLM, zero credits). Detects absolute language, unsupported statistics, security claims lacking evidence, date-sensitive claims |
| `llmRouter.js` | `callLLMJson()` — 3-tier routing: Anthropic direct → OpenRouter → Base44 InvokeLLM. Monthly budget gate via `SF2X_LLM_BUDGET` |
| `anthropic.js` | `callAnthropic()`, `isClaudeModel()` — direct Anthropic API client using `ANTHROPIC_API_KEY` |
| `openrouter.js` | `callOpenRouter()` — OpenRouter API client using `OPENROUTER_API_KEY` |
| `ledger.js` | `appendAudit()` — hash-chained audit log with Ed25519 signing |
| `falsifier.js` | `runFalsifier()`, `runCoverageCheck()` — Gate 2 adversarial falsifier + coverage/detectability check |
| `redTeam.js` | `runRedTeamAttack()` — adversarial attack simulator (prompt injection, authority fabrication, premise inversion, etc.) |
| `calibration.js` | `calibrateTrust()`, `verdictFromSupport()`, `calibrationFor()`, `empiricalCalibration()`, `verdictFromCalibration()` — domain-aware trust calibration |
| `authoritativeSources.js` | `authoritativeFor()`, `classifySource()`, `summarizeGrounding()` — domain → authoritative source registry (PubMed, SEC EDGAR, statutes, etc.) |
| `policyParser.js` | YAML parser for `.aether/policy.yml`, `evaluatePolicy()`, `persistPolicy()` — policy hash computation |
| `telemetry.js` | `emitTelemetry()`, `newTraceId()` — distributed tracing |
| `userMetrics.js` | `recordUserEvent()` — per-user action logging + metrics rollup |
| `caveat.js` | `tribunalCaveat()` — the canonical 4-role tribunal caveat attached to every warrant |
| `apiAuth.js` | API key authentication for inbound API endpoints |
| `auth.js` | Shared auth helpers |
| `webhooks.js` | Outbound webhook delivery (Slack, PagerDuty, custom) |
| `modelRouting.js` | Model routing configuration |
| `sf2xSecurity.js` | Security threshold helpers (`SF2X_SECURITY_THRESHOLD`) |
| `sf2xBench.js` | Benchmark computation helpers |
| `sf2xDebate.js` | Debate record helpers |
| `domainPrompts.js` | Domain-specific prompt templates |
| `corpus-v1.js` / `corpus-v2.js` | Calibration corpora (ground-truth claims) |
| `thinCoverage-v1.js` | Thin coverage test corpus |
| `systemEval.js` | System evaluation helpers |

---

## 8. Frontend Components

### Layout Components
| Component | Path | Description |
|-----------|------|-------------|
| `AppShell` | `src/components/sf2x/AppShell.jsx` | Main app shell — desktop sidebar + mobile drawer/tabbar |
| `PublicNav` | `src/components/sf2x/PublicNav.jsx` | Public page navigation bar with dropdown menu |
| `ProtectedRoute` | `src/components/ProtectedRoute.jsx` | Auth gate for protected routes |
| `ScrollToTop` | `src/components/ScrollToTop.jsx` | Scroll restoration on route change |
| `AuthLayout` | `src/components/AuthLayout.jsx` | Layout for auth pages |
| `MobileTabBar` | `src/components/sf2x/MobileTabBar.jsx` | Bottom tab bar for mobile |
| `PullToRefresh` | `src/components/sf2x/PullToRefresh.jsx` | Pull-to-refresh wrapper for mobile |
| `MobileBackHeader` | `src/components/sf2x/MobileBackHeader.jsx` | Back header for mobile |

### SF2X Feature Components (in `src/components/sf2x/`)
| Component | Description |
|-----------|-------------|
| `PromptConsole` | Main ask/verify console |
| `AnswerCard` | Answer display with warrant |
| `WarrantCard` | Warrant detail card |
| `TrustScoreHeader` | Global trust score badge |
| `ScoreBadge` | Compact score badge |
| `TierBadge` | Source tier badge |
| `TrustExplainer` | Trust score explanation |
| `TrustDisclosureBanner` | Trust disclosure banner |
| `DebatePanel` | Tribunal debate display |
| `DebateTimeline` | Debate timeline view |
| `TribunalTrace` | Tribunal trace viewer |
| `TribunalPicker` | Model trio/duo selector |
| `TribunalLiftCard` | Tribunal lift visualization |
| `RankedAnswers` | Ranked candidate answers |
| `ModelArena` | Model arena display |
| `ModelShowdown` | Model comparison |
| `ModelTrendChart` | Model trend chart |
| `ModelAnswerDetail` | Model answer detail |
| `CompanyBadge` | Company/vendor badge |
| `EpistemicCompass` | Epistemic health compass |
| `EpistemicTrendChart` | 30-day epistemic trend chart |
| `MetricsGrid` | Epistemic metrics grid |
| `InquiryHistory` | Inquiry history list |
| `LineageTimeline` | Provenance lineage timeline |
| `ReviewRow` | Review queue row (hover-expandable) |
| `ReviewBanner` | Review status banner |
| `AuditExplorer` | Audit log explorer |
| `AuditLogList` | Audit log list |
| `SignatureChain` | Hash chain visualization |
| `CalibrationCard` | Calibration report card |
| `CorrelationAuditCard` | Correlation audit card |
| `HistoryCharts` | History charts |
| `ChallengePanel` | Adversarial challenge panel |
| `WhatWouldChange` | Counterfactual display |
| `WhyTrustTour` | Trust tour |
| `RatingKey` | Rating legend |
| `StatCard` | Stat card |
| `AskStats` | Compact stats above chat input |
| `OnboardingChecklist` | Getting started checklist |
| `EmptyState` | Empty state component |
| `CapabilityBadge` | Capability badge |
| `VerifiedTag` | Verified tag |
| `AgentGreeter` | Agent greeting |
| `AgentConversation` | Agent conversation UI |
| `AgentLink` | Agent link |
| `LiveFeed` | Live verification feed |
| `ShareProof` | Share proof link |
| `Newsletter` | Newsletter signup |
| `WebhookVerifyTool` | Webhook verification tool |
| `BatchVerifyTool` | Batch verification tool |
| `ResponsiveSelect` | Responsive select |
| `AuthMarketingPanel` | Auth marketing panel |

### Owner Dashboard Panels (in `src/components/sf2x/owner/`)
| Component | Description |
|-----------|-------------|
| `SettingsPanel` | Admin settings |
| `ApiKeysPanel` | API key management |
| `SubscribersPanel` | Subscriber management |

### UI Primitives (shadcn/ui in `src/components/ui/`)
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, image, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, toast, toaster, toggle, toggle-group, tooltip.

---

## 9. Secrets & Environment

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Direct Anthropic API (Claude models — bypasses Base44 credits) |
| `OPENROUTER_API_KEY` | OpenRouter (multi-model — bypasses Base44 credits) |
| `ED25519_PRIVATE_KEY` | Ed25519 private key for warrant signing |
| `ED25519_PUBLIC_KEY` | Ed25519 public key for warrant verification |
| `sf2x_attestation_key` | HMAC fallback for signatures |
| `STRIPE_SECRET_KEY` | Stripe API (server-side) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe (client-side) |
| `STRIPE_TEST_PUBLISHABLE_KEY` | Stripe test mode |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `SF2X_API_KEY` | Internal API key |
| `SF2X_LLM_BUDGET` | Monthly LLM budget gate |
| `SF2X_SECURITY_THRESHOLD` | Security claim threshold |
| `SF2X_WORKFLOW_TOKEN` | Workflow auth token |

---

## 10. Connectors

| Connector | Type | Status | Scopes |
|-----------|------|--------|--------|
| GitHub | Shared (app-level) | Authorized | `repo:status` |
| Google Sheets | Shared (app-level) | Authorized | `spreadsheets`, `drive.file`, `email` |

### GitHub Scope Gap
Currently only has `repo:status` (for commit statuses). Needs:
- `pull_requests:read` — to auto-fetch PR diffs via API
- `pulls:write` — to post inline PR review annotations

### Connector Configs
- `base44/connectors/github.jsonc`
- `base44/connectors/googlesheets.jsonc`

---

## 11. Stripe Billing

### Products & Prices
| Product | Price | Billing |
|---------|-------|---------|
| Free | $0 | one-time |
| SF2X Starter | $20/mo, $50/yr, $5/mo | recurring |
| SF2X Pro | $399/mo, $100/mo, $30/mo, $300/yr | recurring |
| SF2X Enterprise | $1,999/mo | recurring |
| SF2X Enterprise BYOK | $999/mo | recurring |
| SF2X Scale | $9,999/mo | recurring |
| Premium Trust Insights | $99/mo, $990/yr | recurring |
| SF2X API Access | $49/mo, $199/mo | recurring |

### Pricing Model
- **Gated by tribunal depth and governance features** (not request volume caps)
- Free tier: single-model verification
- Starter: fast 2-model tribunal
- Pro: full 3-model tribunal + red-team
- Enterprise: cross-firm verification + BYOK + governance
- Scale: enterprise + dedicated support
- API Access: programmatic warrant API (pay per call: attest=5, gate=1, inquire=10 credits)

### Key Billing Functions
- `createCheckout` — creates Stripe checkout session
- `stripeWebhook` — handles `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `payment_intent.succeeded`
- `cancelSubscription` / `cancelUnpaidSubscription` — subscription management

---

## 12. SDKs, Embeds & Distribution

### SDKs
| File | Language | Description |
|------|----------|-------------|
| `public/sdks/aether.ts` | TypeScript | Browser/Node SDK for warrant API |
| `public/sdks/aether.py` | Python | Python SDK for warrant API |

### Embeds
| File | Description |
|------|-------------|
| `public/widget.js` | Embeddable verification widget |
| `public/embed.js` | Embeddable badge script |

### Embed Pages
- `/embed` — embed widget setup
- `/embed/badge/:id` — embeddable badge
- `/badge/:id` — full trust badge page

### Browser Extension
- `/extension` — browser extension page (extension code likely external)

---

## 13. MCP Server

The app exposes its data and backend functions to AI clients (ChatGPT, Claude) via an MCP server.

| File | Description |
|------|-------------|
| `base44/mcp/config.json` | MCP server config — exposed entities + tools |
| `mcp-worker/worker.js` | Cloudflare Worker MCP server implementation |
| `mcp-worker/wrangler.toml` | Cloudflare Worker deployment config |
| `mcp-worker/package.json` | Worker dependencies |
| `mcp-worker/README.md` | MCP setup guide |
| `/mcp` (page) | MCP server setup UI |

### Current Exposure
Entities and tools exposed via `base44/mcp/config.json`. Needs expansion to include `Claim` and `EvidencePack` entities + a `search_claims` tool.

---

## 14. RLS Patterns

### Standard Ownership Pattern (most entities)
```json
{
  "create": { "$or": [{ "created_by_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] },
  "read": { "$or": [{ "created_by_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] },
  "update": { "$or": [{ "created_by_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] },
  "delete": { "$or": [{ "created_by_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] }
}
```

### Tenant ID Pattern (Claim, EvidencePack)
```json
{
  "read": { "$or": [{ "created_by_id": "{{user.id}}" }, { "data.tenant_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] }
}
```

### Customer ID Pattern (Inquiry)
```json
{
  "read": { "$or": [{ "created_by_id": "{{user.id}}" }, { "data.customer_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] }
}
```

### Admin-Only Pattern (Policy, AISystem, CalibrationReport)
```json
{
  "create": { "user_condition": { "role": "admin" } },
  "read": null,  // or admin-only
  "update": { "user_condition": { "role": "admin" } },
  "delete": { "user_condition": { "role": "admin" } }
}
```

### Public Create Pattern (NewsletterSignup, VerificationHistory)
```json
{
  "create": null,  // anyone can create
  "read": { "user_condition": { "role": "admin" } }
}
```

### API Key Owner Pattern (ApiKey)
```json
{
  "read": { "$or": [{ "data.user_id": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] },
  "create": { "data.user_id": "{{user.id}}" }  // only own keys
}
```

---

## 15. Credit-Saving Architecture

The entire LLM pipeline is designed to avoid Base44 integration credits:

### 3-Tier LLM Routing (`llmRouter.js`)
1. **Anthropic direct** (`ANTHROPIC_API_KEY`) — Claude models, 0 Base44 credits
2. **OpenRouter** (`OPENROUTER_API_KEY`) — any model, 0 Base44 credits
3. **Base44 InvokeLLM** — last fallback, uses integration credits (currently blocked)

### Deterministic, Zero-Credit Checks
| Check | Module | Description |
|-------|--------|-------------|
| Aether Flash | `aetherFlash.js` | Regex-based risk scanner — absolute language, unsupported statistics, security claims, date sensitivity |
| Claim Extraction | `claimExtractor.js` | Sentence-based decomposition — no LLM needed |
| Policy Evaluation | `policyParser.js` | Rule matching against Policy entity |
| Source Tiering | `attest.js` | URL-based authority tier (T1-T4) |
| Hash Chaining | `ledger.js` | SHA-256 + Ed25519 — no LLM |
| SSRF Guard | `attest.js` | DNS-over-HTTPS resolution, IP validation |

### Stakes Gating
- `low` stakes → single-model (1 LLM call)
- `medium` stakes → fast 2-model tribunal (~5 calls, 55% cheaper)
- `high`/`critical` → full 3-model tribunal (10+ calls)

### Warrant Cache (`attest.js`)
If the same answer text was already attested with a valid, non-expired warrant, the cache returns it instantly — no re-verification.

### Model Access by Tier
- Free/Starter: high-speed detector (Flash/mini models) — cheap
- Pro+: full tribunal with Claude Sonnet
- Enterprise: Claude Opus (most expensive, strictly gated)

---

## 16. Remaining Build Work

See `REMAINING_BUILD_PLAN.md` for the actionable task list with 6 items:
1. GitHub connector scope upgrade (`pull_requests:read` + `pulls:write`)
2. Ledger integrity check in Trust Center UI
3. PR verification UI refinement
4. Public claims browser
5. Public warrant verification endpoint
6. MCP server enhancement

---

## Known Issues
- Integration credits exhausted until 2026-09-04 — Base44 InvokeLLM, SendEmail, UploadFile, etc. are blocked. Anthropic and OpenRouter API calls are unaffected.
- GitHub PR diff fetching currently requires manual `diff_text` input until connector scope is upgraded.
- The verifier is itself an LLM; it can be wrong or lack non-public knowledge (documented caveat attached to every warrant via `tribunalCaveat()`).
- Calibration thresholds are heuristic and domain-tuned.
- The app has not undergone an independent third-party audit.

---

## File Structure Summary
```
src/
  pages/          # 70+ page components
  components/
    ui/           # shadcn/ui primitives
    sf2x/         # Aether feature components
      owner/      # Owner dashboard panels
  lib/            # Client-side utilities (sf2x.js, auth, query-client, etc.)
  hooks/          # React hooks (use-mobile, use-size)
  api/            # base44Client (pre-initialized SDK)

base44/
  entities/       # 29 entity schemas (.jsonc)
  functions/      # 47 backend functions (entry.ts)
  shared/         # 25+ shared modules (.js)
  workflows/      # 14 workflow definitions (.jsonc)
  agents/         # 4 in-app agent configs (.jsonc)
  connectors/     # OAuth connector configs (.jsonc)
  mcp/            # MCP server config
  config.jsonc    # App config

public/
  sdks/           # TypeScript + Python SDKs
  widget.js       # Embeddable widget
  embed.js        # Embeddable badge script
  sitemap.xml
  robots.txt

mcp-worker/       # Cloudflare Worker MCP server
``