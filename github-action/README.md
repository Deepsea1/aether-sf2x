# Aether Hallucination Guard — GitHub Action

## Overview

Verify AI responses in your CI/CD pipeline. The Aether GitHub Action runs the 3-model tribunal on your AI-generated content and fails the build if hallucinations are detected.

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
        uses: sf2x/aether-hallucination-guard@v1
        with:
          api-key: ${{ secrets.AETHER_API_KEY }}
          text: prompts/output.txt
          threshold: '85'
          fail-on-contested: 'false'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | No | `''` | Aether API key (or set `AETHER_API_KEY` secret) |
| `text` | Yes | — | Text to verify, or path to a file |
| `threshold` | No | `80` | Minimum trust score to pass (0-100) |
| `fail-on-contested` | No | `false` | Fail build if verdict is "contested" |

## Outputs

| Output | Description |
|--------|-------------|
| `trust-score` | Trust score 0-100 |
| `verdict` | Tribunal verdict (verified, contested, rejected) |
| `corrections` | JSON array of corrections |

## Example Workflows

### Verify a prompt output
```yaml
- uses: sf2x/aether-hallucination-guard@v1
  with:
    text: "According to Section 4.1, all employees get 15 vacation days."
    threshold: '85'
```

### Verify a file
```yaml
- uses: sf2x/aether-hallucination-guard@v1
  with:
    text: prompts/system_prompt.txt
    threshold: '90'
    fail-on-contested: 'true'
```

### Batch verify multiple files
```yaml
- name: Verify all prompt files
  run: |
    for file in prompts/*.txt; do
      echo "Verifying $file..."
      # The action will verify each file
    done
```

## Verdict Meanings

| Verdict | Trust Score | Action |
|---------|------------|--------|
| ✅ verified | 80-100 | Build passes |
| ⚠️ contested | 50-79 | Build passes (unless fail-on-contested=true) |
| ❌ rejected | 0-49 | Build fails |

## Get Your API Key

1. Go to https://aether.sf2x.ai/api-docs
2. Sign up for a free account (100 verifications/month)
3. Generate an API key
4. Add it as a GitHub secret: `AETHER_API_KEY`
