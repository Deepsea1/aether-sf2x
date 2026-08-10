# Domain pack: `technical-docs@1.0`

The first Aether domain pack (MASTER_PLAN v5 §11.2, decision C2). A domain pack
is the unit of verification policy: identity + version, an authority ladder,
freshness windows per source class, materiality floors, contradiction-search
requirements, and the release-gate defaults a repo policy inherits.

Every line below carries an enforcement status so the pack never claims more
than the shipped code does:

- **enforced-now** — a shipped component applies it today (named per line).
- **declared** — pack policy that consumers should honor; automated enforcement
  is future work (target phase noted where the plan pins one).

Repo policies instantiate this pack via `domain_pack: technical-docs@1.0` in
`.aether/policy.yml` (parsed by `app/base44/shared/policyParser.js`, policy v2 —
§11.3). Aether's own dogfooding policy at `/.aether/policy.yml` is the reference
instantiation (§19.6).

---

## 1. Scope

Claims made in: READMEs · developer docs · API guides and examples · release
notes · changelogs · configuration guidance · PR documentation changes ·
AI-assisted support content tied to versioned sources.

Out of scope: source code itself (human + CI review), marketing pages without
factual claims, and anything a repo policy's `scope.ignore` excludes.

- `scope.include` / `scope.ignore` globs — **enforced-now** for `ignore`
  (`githubPrVerify` maps matching file paths to the `out_of_scope` disposition
  via the §8.1 resolver); `include` narrowing of extraction is **declared**.
- `changed_files_only` — **enforced-now by construction** in the PR wedge (it
  only ever sees the PR diff — the §7.2 delta rule); **declared** for any
  future whole-repo sweep surface.
- `max_claims_per_run` — **enforced-now** (`githubPrVerify` cost cap: overage
  degrades the run to advisory with an explicit note, never silent truncation).

## 2. Authority ladder (tiers are pack-scoped — §5.5)

`authorityTier` is an integer defined by this pack, 0 = most controlling,
larger = weaker. Cross-pack tier comparison is undefined and forbidden.

```text
tier 0  versioned product spec / source-controlled canonical docs
tier 1  official API schema / code contract
tier 2  release notes tied to a version
tier 3  maintainer-approved internal technical documentation
tier 4  vendor documentation
tier 5  issue tracker / community content — context_only unless explicitly approved
```

Ladder status: **declared** as the pack's tier mapping. What ships today is
`attest.js`'s host-heuristic source tiering (`tierForSource`, T1–T4 weights)
applied to citation snapshots — a coarser signal that the wedge records per
citation (**enforced-now**). Mapping those snapshots onto this 0–5 ladder in
verdict logic is future work (P4). Many weak sources never outrank a
controlling authority by count (§5.7) — **declared**, resolver-adjacent.

## 3. Freshness defaults (per source class)

A pinned spec doesn't rot on a clock; news does. Defaults a repo policy
inherits when its `sources.freshness_days` omits a class:

| Source class           | Default window | Rationale                              |
|------------------------|----------------|----------------------------------------|
| `versioned_spec`       | 3650 days      | version-pinned — supersession, not age, retires it |
| `release_notes`        | 730 days       | tied to a release line                 |
| `vendor_documentation` | 180 days       | vendors move without notice            |
| `news_or_secondary`    | 90 days        | fastest-rotting class                  |

- Per-class map parsing — **enforced-now** (`policyParser.js` v2; a plain
  number remains valid for v1 compatibility).
- Freshness *gating* of evidence by class — **declared** (the shipped stale
  signal is Aether Flash's year-mention heuristic plus the v1 per-rule
  `freshness_days` + `block_if_stale` action; class-aware gating lands with
  the evidence-fabric work).

## 4. Materiality floors (recommendations)

Floors are deterministic (§6.2) and only ever RAISE materiality — never lower
it. Recommended baseline for any technical-docs repo:

```yaml
materiality_rules:
  floors:
    - match: "SECURITY.md"            # security guidance is always high-stakes
      min_materiality: high
    - match: "docs/api/**"            # API claims are load-bearing for integrators
      min_materiality: high
    - pattern: "(guarantee|always|never|all versions|unlimited)"
      min_materiality: high           # absolute language is where docs lie hardest
```

- Floor parsing + application in `evaluatePolicy` (glob on the claim's
  `file_path`, case-insensitive regex on the claim's `text`, max-of-base-and-
  floor) — **enforced-now** (`policyParser.js` v2).
- The PR wedge currently derives base materiality from the claim's
  deterministic risk level and passes only `category`/`verdict_status` to
  `evaluatePolicy`; forwarding `file_path`/`text` so the floors fire in that
  path is **declared** (wedge wiring follow-up).

## 5. Contradiction-search requirements

Pack policy: a claim at `high`+ materiality is not "supported" merely because
supporting evidence exists — a contradiction search against controlling
authorities (tiers 0–2) is required before `verified_for_stated_use`, and any
`contradicts` relation forces the `contradicted` verdict regardless of the
support count (§5.3, §8.1).

- `contradicted` → disposition/gate mapping — **enforced-now**
  (`decisionResolver.js` ladder + `evaluatePolicy` release-gate rules honor a
  supplied `contradicted` status).
- The contradiction *search* itself (retrieval aimed at disconfirming
  evidence, per-claim, before verdict) — **declared** (P4, with independence
  analysis §5.6).
- `claim_policy.contradiction_search_required_for` in the policy file —
  **declared**; the v2 parser currently ignores the `claim_policy` block
  (unknown keys are forward-compatible, §11.3 alignment note below).

## 6. Claim-type option: `code_example`

The pack declares a `code_example` claim type: a fenced code sample in docs is
a checkable claim ("this compiles / runs / produces this output"), verified by
sandboxed compile/run — a differentiator no citation checker has (§11.2).

- Status: **declared, enforcement P4+**. No shipped component executes doc
  samples today; repo policies may already tag rules with the category so the
  data shape is ready.

## 7. Annotated repo policy (v2, plan §11.3)

The full v2 example, annotated with parse/enforcement status. The live parser
(`policyParser.js`) accepts every key below; keys marked *inert* parse into the
policy object (and its hash) but nothing consumes them yet — they are policy
declarations, not dead weight: the hash binds them to every verdict now, so
flipping them later is an auditable policy change (§11.4).

```yaml
version: 2                          # v2 marker — parsed
domain_pack: technical-docs@1.0     # parsed; pack resolution declared

scope:
  include: ["README.md", "docs/**/*.md", "CHANGELOG.md"]   # parsed; extraction narrowing declared
  ignore: ["docs/archive/**"]       # parsed + enforced-now (out_of_scope disposition)
  changed_files_only: true          # delta verification — §7.2 (inherent in the PR wedge)
  max_claims_per_run: 400           # enforced-now cost cap; excess → advisory + logged, never silent truncation

materiality_rules:                  # deterministic floors — §6.2
  floors:                          # parsed + applied by evaluatePolicy (floors only ever raise)
    - match: "SECURITY.md"
      min_materiality: high
    - match: "docs/api/**"
      min_materiality: high
    - pattern: "(guarantee|always|never|all versions|unlimited)"
      min_materiality: high

sources:
  allowed:                          # parsed; fetch-time allowlist enforcement declared
    - host: "docs.example.com"
    - repo: "github.com/example-org/*"   # repo/path prefix — a bare host is not a boundary
  freshness_days:                        # parsed; class-aware gating declared (§3 above)
    versioned_spec: 3650
    release_notes: 730
    vendor_documentation: 180
    news_or_secondary: 90

claim_policy:                       # declared — ignored by the parser today (forward-compatible)
  required_coverage: { critical: 1.0, high: 0.95, overall: 0.80 }
  contradiction_search_required_for: [critical, high]
  independence_required_for: [critical]

verdict_reuse:
  enabled: true                     # parsed; the wedge's reuse cache runs by default —
  respect_freshness: true           # honoring enabled:false as an opt-out is declared

release_gate:
  mode: advisory                    # advisory | enforcing — enforced-now: advisory never blocks
                                    # (githubPrVerify + resolveGate); enforcing requires an active
                                    # capability card with measured false-block rate (§18.2)
  block_on:                         # parsed + enforced-now via evaluatePolicy / resolveGate
    - critical_unsupported_claim
    - critical_contradicted_claim
    - evidence_integrity_failure
    - prohibited_source
    - warrant_signature_failure
    - active_security_circuit_breaker
  review_on:                        # v2 spelling; alias of require_review_on — parsed
    - high_unsupported_claim
    - conflicting_authorities
    - stale_evidence
    - coverage_below_threshold
    - injection_indicators_present
  review_sla:                       # §12.5 — review_required is never a black hole
    high:     { hours: 72, on_timeout: advisory }        # parsed; consumed by the review pipeline
    critical: { hours: 72, on_timeout: remain_blocked, escalate_to: decision_owner }
  degraded_mode:
    manual_review_fallback: true    # §15.4 — parsed, inert (breaker wiring P4)
  overrides:
    required_approvals: 2           # parsed, inert (override flow §12)
    require_expiry: true
    require_rationale: true
```

Parser notes (v2): a file is v2 when it says `version: 2` or uses any v2
top-level key; a v2 file without `mode` is **advisory** — never enforcing by
accident. Malformed v2 constructs (bad `mode`, bad `min_materiality`, a floor
regex that doesn't compile, non-numeric freshness…) fail closed with a clear
error. v1 files parse exactly as they always have. `review_sla` entries must
use inline maps (`{ hours: 72, on_timeout: advisory }`); block style is
rejected with a clear error.

## 8. Versioning

This is `technical-docs@1.0`. Changes to the ladder, freshness defaults, floor
recommendations, or requirement statuses bump the pack version and go through
policy change control (§11.4): replay against historical warrants, adversarial
review, shadow execution, staged rollout. A policy referencing `@1.0` keeps
meaning `@1.0` until its repo owner moves it.
