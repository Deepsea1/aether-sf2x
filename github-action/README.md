# Aether Hallucination Guard — GitHub Action

## Overview

Verify AI responses and PR claims in your CI/CD pipeline. The Aether GitHub Action sends your AI-generated content to the Aether verification API and reports the result on the build.

**v2 gates on per-claim dispositions, not a single score.** When the server returns claim-level dispositions (the claim resolver), the Action gates on them — `blocked` claims and high-materiality `needs_review`/`contradicted` claims — and ignores the raw trust score entirely. Against an older server that returns only `trust_score` + `verdict`, the v1 threshold rule applies unchanged.

## Breaking change in v2: advisory is the default

**v1 failed the build by default. v2 does not.** The default mode is now `advisory`: the Action reports findings — inline annotations plus an explicit "advisory mode — would have blocked/reviewed N claims" summary — but always exits 0. If you relied on the v1 default-blocking behaviour, add one line:

```yaml
with:
  mode: enforcing
```

Why advisory by default: a CI gate that hard-blocks without a measured false-block rate kills adoption the same way over-silence kills answerability (MASTER_PLAN §18.2 — the symmetric gate). Enforcement is an explicit opt-in per repo, made after you have watched advisory runs and know what enforcing would have done to them.

## Installation

Add this to your GitHub workflow:

```yaml
name: AI Response Verification

on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'evals/**'
      - 'src/ai/**'

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify AI responses
        uses: sf2x/aether-hallucination-guard@v2
        with:
          api-key: ${{ secrets.AETHER_API_KEY }}
          text: prompts/output.txt
          # mode defaults to 'advisory' — reports, never fails the build
```

### Opting in to enforcement

Once advisory runs show an acceptable would-have-blocked rate for your repo:

```yaml
      - name: Verify AI responses (enforcing)
        uses: sf2x/aether-hallucination-guard@v2
        with:
          api-key: ${{ secrets.AETHER_API_KEY }}
          text: prompts/output.txt
          mode: enforcing
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | No | `''` | Aether API key (or set `AETHER_API_KEY` secret) |
| `text` | Yes | — | Text to verify, or path to a file |
| `mode` | No | `advisory` | `advisory` reports but never fails; `enforcing` fails on blocked / high-materiality review claims |
| `threshold` | No | `80` | **Deprecated.** Used only against older servers with no claim dispositions, and only in `enforcing` mode |
| `fail-on-contested` | No | `false` | **Deprecated.** Legacy (no-dispositions) responses only, and only in `enforcing` mode |

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | Trust score 0-100 (legacy responses; `0` when dispositions are present) |
| `verdict` | Tribunal verdict (verified, contested, rejected; `unknown` when dispositions are present) |
| `truth-status` | Factual truth state; model-only assessments remain `UNKNOWN` |
| `evidence-basis` | Basis for the factual truth state (for example, `MODEL_ASSESSED`) |
| `proof-level` | Evidence proof level (`L0`–`L4`) kept separate from score and verdict |
| `integrity-status` | Whether the returned evidence/record is intact and usable |
| `action-authorization` | Whether an action is authorized; never inferred from the factual status alone |
| `corrections` | JSON array of corrections |
| `gate-decision` | The server's own `gate_decision` (passed, warned, requires_review, blocked); empty for legacy responses |
| `dispositions` | JSON array of per-claim dispositions (`{disposition, materiality, category, file_path, diff_line, text}`); empty for legacy responses |

## How the gate decides

When the server response carries per-claim dispositions, the raw trust score is **ignored** — no single score is ever the decision (MASTER_PLAN §1.4):

| Finding | `advisory` (default) | `enforcing` |
|---------|----------------------|-------------|
| Any claim `blocked` | Pass + warning annotations + "would have blocked" summary | **Fail** |
| `needs_review` / `contradicted` at high or critical materiality | Pass + warning annotations + "would have reviewed" summary | **Fail** |
| `needs_review` / `contradicted` at normal or low materiality | Pass | Pass |
| Everything else (`verified_for_stated_use`, `supported_with_limits`, `not_supported`, `out_of_scope`, `unknown`) | Pass | Pass |

A gating claim with **missing or unreadable materiality is treated as high** — a gate that cannot read the stakes must not assume they are low.

When dispositions are absent (an older server), the v1 rule applies unchanged: trust score below `threshold` fails, `rejected` fails, `contested` fails only with `fail-on-contested: true` — but in `advisory` mode even those become a "would have failed" warning and the build continues.

## Migration: v1 → v2

| You had (v1) | You want in v2 |
|--------------|----------------|
| Default settings (build blocked on low score) | `mode: enforcing` to keep blocking; nothing, to switch to report-only |
| `threshold: '90'` as the gate | `mode: enforcing` — the threshold still applies against legacy servers; disposition-aware servers gate on claims instead |
| `fail-on-contested: 'true'` | `mode: enforcing` + keep the input; it still applies against legacy servers |
| A report-only wrapper (`continue-on-error: true`) | Delete the wrapper — `mode: advisory` is exactly this, with a better report |

## Legacy verdict meanings (servers without dispositions)

| Verdict | Trust Score | Action in `enforcing` |
|---------|------------|--------|
| ✅ verified | 80-100 | Build passes |
| ⚠️ contested | 50-79 | Build passes (unless `fail-on-contested: 'true'`) |
| ❌ rejected | 0-49 | Build fails |

## Get Your API Key

1. Go to https://aether.sf2x.com/api-docs
2. Sign up for a free account (100 verifications/month)
3. Generate an API key
4. Add it as a GitHub secret: `AETHER_API_KEY`
