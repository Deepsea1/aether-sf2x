# 🛡️ Aether by SF2X

**Don't trust. Verify.**

Aether is an AI trust verification layer that catches LLM hallucinations in real time using a 3-model tribunal architecture. It turns unverified AI outputs into audit-ready, cryptographically warranted answers.

## 📊 Benchmark Results

All numbers are Aether's own internal suites, run through the live pipeline and published —
regardless of outcome — on the in-app [methodology page](https://aether.sf2x.com/methodology).
They are vendor-run measurements on small, versioned suites, not independent audits.

| Suite | n | Measures | Latest published result |
|---|---|---|---|
| Correlation audit | 24 (12 true / 12 hallucinated) | Does the trust score separate true from hallucinated claims? | AUC 1.0 · Pearson r=0.98 on this suite — a strong internal signal at this n, not proof of perfect separation in general |
| Negative controls | 30 (+5 thin-coverage probes) | Fabricated-claim catch rate, true-claim pass rate, honest abstention | Gates every release; runs published live |
| Tribunal lift | 6 hard adversarial questions | Single model vs. full tribunal | Per-item table published |

**Withdrawn claims.** Earlier versions of this README compared Aether (91/100) against
"Plain LLM 14/100, Vanilla RAG 28/100, RAG + Output Validation 51/100" with derived
"hallucination rates," and cited a "91 with red-team / 58 without" ablation. Those baselines
were never evaluated by any code in this repository, so they are withdrawn until they can be
re-measured and published with n and methodology attached. Live, always-current results:
[aether.sf2x.com/benchmark](https://aether.sf2x.com/benchmark).

## 🏗️ How It Works

```
Input Text → [Proposer] → [Critic] → [Verifier] → Cryptographic Warrant
```

The **red-team loop** is architectural — the tribunal is adversarial by design. (The previously
cited 91-vs-58 ablation is among the withdrawn claims above.)

## 🔌 API Quick Start

```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
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

- Live App: https://aether.sf2x.com
- Full API Docs: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Integration Guide: [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md)
- GitHub Action: [`github-action/README.md`](github-action/README.md)

## 👤 Author

**Cameron Piper** — [@Deepsea1](https://github.com/Deepsea1)

---

*Don't trust. Verify.*
