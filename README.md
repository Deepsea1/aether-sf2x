# 🛡️ Aether by SF2X

**Don't trust. Verify.**

Aether is an AI trust verification layer that catches LLM hallucinations in real time using a 3-model tribunal architecture. It turns unverified AI outputs into audit-ready, cryptographically warranted answers.

## 📊 Benchmark Results

| System | Trust Score | Hallucination Rate |
|--------|------------|-------------------|
| Plain LLM (no guardrails) | 14/100 | 86% |
| Vanilla RAG | 28/100 | 72% |
| RAG + Output Validation | 51/100 | 49% |
| **Aether (tribunal + red-team)** | **91/100** | **9%** |

**Key metrics:** AUC 1.0 · Pearson r=0.98 · Perfect separation between true and hallucinated claims

## 🏗️ How It Works

```
Input Text → [Proposer] → [Critic] → [Verifier] → Cryptographic Warrant
```

The **red-team loop** is critical: 91/100 with it, 58/100 without.

## 🔌 API Quick Start

```bash
curl -X POST https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -d '{"text": "According to Section 4.1, all employees get 15 vacation days."}'
```

## 🔧 GitHub Action

```yaml
- uses: Deepsea1/aether-sf2x@v1
  with:
    api-key: ${{ secrets.AETHER_API_KEY }}
    text: prompts/output.txt
    threshold: '85'
```

## 📁 Structure

- `github-action/` — CI/CD hallucination guard
- `sdk/` — Python + JavaScript SDKs
- `docs/` — API reference + integration guides
- `chrome-extension/` — Browser extension
- `marketing/` — Launch materials

## 💰 Pricing

Free ($0, 100/mo) · Starter ($399, 5K) · Pro ($1,999, 25K) · Enterprise ($9,999, unlimited)

## 🔗 Links

- Live App: https://aether.sf2x.ai
- Full API Docs: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Integration Guide: [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md)
- GitHub Action: [`github-action/README.md`](github-action/README.md)

## 👤 Author

**Cameron Piper** — [@Deepsea1](https://github.com/Deepsea1)

---

*Don't trust. Verify.*
