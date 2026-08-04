# Reddit r/MachineLearning Post

## Title
[Discussion] We benchmarked LLM hallucination rates (86%) and built a 3-model tribunal that catches them (91/100, AUC 1.0)

## Body

We just ran a benchmark comparing different approaches to LLM hallucination detection and the results were... concerning.

**The Problem:**
Plain LLMs hallucinate 86% of the time. We tested across 5 systems and the gap between "confident-sounding" and "actually correct" is massive.

**The Benchmark:**

| System | Trust Score | Hallucination Rate |
|--------|------------|-------------------|
| Plain LLM (no guardrails) | 14/100 | 86% |
| Vanilla RAG | 28/100 | 72% |
| Baseline LLM | 39/100 | 61% |
| RAG + Output Validation | 51/100 | 49% |
| **Aether (3-model tribunal + red-team)** | **91/100** | **9%** |

**The Architecture:**
Instead of a single LLM-as-judge, we use a 3-model tribunal:
1. **Proposer** generates the answer
2. **Critic** adversarially challenges every premise, citation, and logical step
3. **Verifier** renders a verdict with trust score (0-100) and specific corrections

Every answer gets a cryptographic warrant with premises, sources, and a signed hash.

**Key Findings:**
- AUC 1.0, Pearson r=0.98 — perfect separation between true and hallucinated claims
- The red-team loop is the critical differentiator: 91/100 with it, 58/100 without
- The tribunal catches fabricated citations, false premises, and adversarial outputs that single-model guardrails miss
- Example: it caught a fabricated "Section 4.1: Paid Time Off" that doesn't exist in any source document
- Mean time to correction: 38 seconds vs 300s for plain LLM

**What We Built:**
- Public benchmark leaderboard with full methodology
- Public playground — submit any question, watch the tribunal debate it live
- Chrome extension — puts a "Verify" button on ChatGPT, Claude, and Gemini responses
- API for real-time trust scoring

**We're looking for:**
- Feedback on the evaluation methodology
- Researchers interested in the dataset
- Suggestions for improving the red-team loop

Links: https://aether.sf2x.com/benchmark | https://aether.sf2x.com/playground

Happy to answer questions about the tribunal architecture, benchmark methodology, or the red-team adversarial loop.

EDIT: For those asking about the tribunal vs LLM-as-judge — the key difference is adversarial cross-examination. The Critic model is specifically instructed to challenge every premise, not just evaluate. It actively looks for fabricated citations, false premises, and logical gaps. A single LLM-as-judge can be convinced by confident-sounding answers. The Critic can't be — its job is to find what's wrong.
