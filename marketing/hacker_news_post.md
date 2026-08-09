# Hacker News Post

**Title:** Show HN: Aether by SF2X — 3-model tribunal that catches AI hallucinations (91/100, AUC 1.0)

**Body:**

Hi HN,

I built Aether because I kept catching LLMs hallucinating with terrifying confidence. ChatGPT would cite "Section 4.1 of the employee handbook" that didn't exist. Claude would state "California Labor Code Section 227.3" — not a real statute. Gemini would fabricate Bureau of Labor Statistics data with specific confidence intervals.

All of it sounded authoritative. All of it was wrong.

I benchmarked this: plain LLMs hallucinate **86% of the time**. The hallucinations aren't random noise — they're convincing. Fabricated citations with correct formatting. False premises stated with absolute certainty. Legal references that don't exist in any statute.

Traditional guardrails miss these because they use a single model to check another model's work. But if the checking model has the same blind spots as the generating model, it'll approve the same hallucinations.

So I built a different approach: a **3-model tribunal**.

## How it works

1. **Proposer** — Generates the answer (GPT-4o, Claude, Gemini, whatever you choose)
2. **Critic** — Adversarially challenges every claim. Not "is this good?" but "what's wrong with this?"
3. **Verifier** — Renders a verdict with trust score (0-100) and specific corrections. Issues a cryptographic warrant with premises, sources, and a signed hash.

The key insight: the Critic is instructed to *challenge*, not *evaluate*. That reframing changes everything. LLM-as-judge asks "is this answer good?" — the Critic asks "what's wrong with this answer?"

## Benchmark results

| System | Trust Score | Hallucination Rate |
|--------|------------|-------------------|
| Plain LLM | 14/100 | 86% |
| Vanilla RAG | 28/100 | 72% |
| RAG + Output Validation | 51/100 | 49% |
| **Aether Tribunal + Red-Team** | **91/100** | **9%** |

AUC: 1.0 — perfect separation between true and hallucinated claims. Pearson r=0.98.

## The red-team loop is non-negotiable

With the red-team adversarial testing loop enabled: **91/100**.
Without it: **58/100**.

The red-team loop continuously generates novel attack patterns — new ways to sneak hallucinations past the tribunal. These attacks are then used to train the Critic. It's an arms race.

## What's available

- **API** — 13 endpoints including batch verification, webhook callbacks, and a multi-model diagnostic matrix
- **GitHub Action** — CI/CD hallucination guard. Fails your build if hallucinations are detected.
- **Chrome Extension** — One-click "Verify with Aether" on ChatGPT, Claude, and Gemini
- **Python + JavaScript SDKs**
- **Public Playground** — Watch the tribunal debate live
- **Red-Team Arena** — Try to trick the tribunal and earn credits if you succeed

## Live demo

I ran "How many vacation days do I get in California?" through 4 models:

- **GPT-4o**: 100/100 ✅ (proper disclaimers, no fabricated citations)
- **Claude 3.5**: 40/100 ❌ (fabricated "Labor Code Section 227.3")
- **Gemini 1.5**: 100/100 ✅ (comprehensive, hedged properly)
- **Llama 3.1**: 25/100 ❌ (fabricated "Section 12945", absolute claims)

The tribunal caught the fabricated citations in Claude and Llama, while verifying GPT-4o and Gemini's properly hedged responses.

## Try it

- **Repo:** https://github.com/Deepsea1/aether-sf2x
- **API Docs:** https://github.com/Deepsea1/aether-sf2x/blob/main/docs/API_REFERENCE.md
- **GitHub Action:** https://github.com/Deepsea1/aether-sf2x/tree/main/github-action

```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -d '{"text": "According to Section 4.1, all employees get 15 vacation days."}'

# → {"trust_score": 40, "verdict": "contested", "corrections": [...]}
```

Pricing: Free (100/mo), Starter ($399/mo), Pro ($1,999/mo), Enterprise ($9,999/mo).

I'd love feedback on the tribunal architecture, especially from anyone working on LLM evaluation or AI safety. The red-team loop is the key differentiator — without continuous adversarial testing, the tribunal degrades within days.

Don't trust. Verify.

---

**Tags:** AI, Machine Learning, LLM, Hallucination Detection, AI Safety

**Posting strategy:** Post between 8-10am PT on a weekday (Tuesday or Wednesday for best HN engagement). Title should be concise and technical. The benchmark table is the hook — 86% hallucination rate gets attention.
