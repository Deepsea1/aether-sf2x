# Aether by SF2X — Press Kit

## One-Pager

### What is Aether?
Aether by SF2X is an AI trust verification layer that catches LLM hallucinations in real time using a 3-model tribunal architecture. It turns unverified AI outputs into audit-ready, cryptographically warranted answers.

### The Problem
LLMs hallucinate 86% of the time. Fabricated citations, false premises, and confident-sounding errors slip into production systems, legal documents, and customer-facing tools. Existing solutions — single-model guardrails, RAG, output validation — still miss adversarial hallucinations.

### The Solution
Aether uses a 3-model tribunal:
1. **Proposer** generates the answer
2. **Critic** adversarially challenges every premise, citation, and logical step
3. **Verifier** renders a verdict with trust score (0-100) and specific corrections

Every answer gets a **cryptographic warrant** — premises, sources, and a signed hash — making it audit-ready.

### Benchmark Results
| System | Trust Score | Hallucination Rate |
|--------|------------|-------------------|
| Plain LLM (no guardrails) | 14/100 | 86% |
| Vanilla RAG | 28/100 | 72% |
| Baseline LLM | 39/100 | 61% |
| RAG + Output Validation | 51/100 | 49% |
| **Aether (tribunal + red-team)** | **91/100** | **9%** |

**Key Metrics:**
- AUC: 1.0 (perfect separation between true and hallucinated claims)
- Pearson correlation: r = 0.98
- Warrant rate: 95%
- Mean time to correction: 38 seconds (vs 300s for plain LLM)
- Red-team loop impact: 91/100 with it, 58/100 without

### Products
1. **verifyResponse API** — POST /verify endpoint for real-time trust scoring
2. **Chrome Extension** — One-click Verify button on ChatGPT, Claude, Gemini, Copilot, Perplexity
3. **Public Playground** — Submit any question, watch the tribunal debate it live
4. **Benchmark Leaderboard** — Public benchmark with full methodology
5. **Tribunal Playground** — Interactive UI for testing tribunal queries

### Pricing
| Tier | Price | Verifications/mo |
|------|-------|-----------------|
| Free | $0 | 100 |
| Starter | $399/mo | 5,000 |
| Pro | $1,999/mo | 25,000 |
| Enterprise | $9,999/mo | Unlimited |

### Founder
**Cameron Piper** — Founder & Builder, SF2X
Email: campiper84@gmail.com
Website: https://aether.sf2x.com

### Key Links
- Live App: https://aether.sf2x.com
- Benchmark: https://aether.sf2x.com/benchmark
- Playground: https://aether.sf2x.com/playground
- API Docs: https://aether.sf2x.com/api-docs
- Chrome Extension: [Download link]
- Pricing: https://aether.sf2x.com/pricing

### Social Media
- Twitter/X: [@SF2X]
- LinkedIn: [Company page TBD]

### Suggested Interview Topics
1. Why single-model guardrails fail against adversarial hallucinations
2. The 3-model tribunal architecture and why adversarial cross-examination works
3. The red-team loop: how adversarial testing keeps the tribunal calibrated
4. Benchmark methodology: AUC 1.0, Pearson r=0.98, and what "perfect separation" means
5. The Chrome extension: putting verification in the hands of end users
6. The public playground: making AI accountability transparent and interactive

### Logo & Assets
- Logo: Black square with white compass icon
- Brand colors: Black (#000000), Orange (#FF6600), White (#FFFFFF)
- Tagline: "Don't trust. Verify."

### Boilerplate
Aether by SF2X is an AI trust verification layer that uses a 3-model tribunal to catch LLM hallucinations in real time. Founded in 2026, Aether delivers audit-ready answers with cryptographic warrants, a Chrome extension for one-click verification on major AI chat platforms, and a public playground for transparent AI accountability. Benchmark results show 91/100 trustworthiness (AUC 1.0, Pearson r=0.98) compared to 14/100 for unguarded LLMs.
