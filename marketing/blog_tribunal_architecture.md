# How a 3-Model Tribunal Catches AI Hallucinations
## (And Why Single-Model Guardrails Miss Them)

**By Cameron Piper, Founder of SF2X**

---

AI models are confident. That's the problem.

When ChatGPT tells you "According to Section 4.1 of the employee handbook, you are entitled to 15 vacation days," it sounds authoritative. Clean formatting. Professional tone. A specific section number. It must be real, right?

It's not. Section 4.1 doesn't exist. The model fabricated it.

We benchmarked this. Plain LLMs hallucinate **86% of the time**. That's not a edge case — it's the default behavior. And the hallucinations aren't random noise. They're *convincing*. Fabricated citations with correct formatting. False premises stated with absolute confidence. Legal references that don't exist in any statute.

Traditional guardrails miss these because they use a single model to check another model's work. But if the checking model has the same blind spots as the generating model, it'll approve the same hallucinations.

## The Tribunal Architecture

We built Aether to solve this differently. Instead of one model checking another, we use a **3-model tribunal** — three AI models with different roles, different instructions, and different perspectives:

### 1. The Proposer
The Proposer generates the initial answer. This is the model that the user is interacting with — GPT-4o, Claude, Gemini, whatever the user chose. It does what AI models do: generates a confident, well-formatted response.

### 2. The Critic
The Critic is where it gets interesting. The Critic is specifically instructed to **adversarially challenge** every claim the Proposer made. Not evaluate. Not assess. *Challenge*.

The Critic is told: "Find what's wrong with this answer. Check every citation. Verify every premise. Challenge every absolute claim. Look for fabricated sources."

This is fundamentally different from LLM-as-judge, where the judge model is asked "Is this answer good?" The Critic is asked "What's wrong with this answer?" — and that reframing changes everything.

### 3. The Verifier
The Verifier takes the Proposer's answer and the Critic's challenges and renders a **verdict**. It doesn't just say "good" or "bad" — it produces:
- A **trust score** (0-100) 
- Specific **corrections** for each unsupported claim
- A **cryptographic warrant** with premises, sources, and a signed hash

The warrant is what makes the answer audit-ready. If you're using Aether to verify HR policy answers in production, every answer comes with a permanent, verifiable record of what was checked and what was found.

## The Benchmark Results

We tested this across 5 system configurations:

| System | Trust Score | What Happens |
|--------|------------|-------------|
| Plain LLM | 14/100 | 86% hallucination rate. Fabricated citations pass. |
| Vanilla RAG | 28/100 | Better, but still misses adversarial hallucinations. |
| Baseline LLM | 39/100 | Some improvement, but no systematic verification. |
| RAG + Output Validation | 51/100 | Catches format errors, misses semantic ones. |
| **Aether Tribunal + Red-Team** | **91/100** | Catches fabricated citations, false premises, adversarial outputs. |

The key metrics:
- **AUC: 1.0** — perfect separation between true and hallucinated claims
- **Pearson correlation: r = 0.98** — near-perfect correlation between predicted and actual trustworthiness
- **Warrant rate: 95%** — 95% of answers get a full cryptographic warrant
- **Mean time to correction: 38 seconds** (vs 300s for plain LLM)

## The Red-Team Loop: 91 vs 58

The most important finding: the red-team loop is non-negotiable.

With the red-team adversarial testing loop enabled: **91/100**.
Without it: **58/100**.

The red-team loop continuously generates novel attack patterns — new ways to sneak hallucinations past the tribunal. These attacks are then used to train the Critic to recognize and block them. It's an arms race, and the tribunal needs to keep running to stay sharp.

When the red-team loop was disabled, the benchmark score dropped from 91 to 58 in days. The tribunal started missing the same hallucinations it used to catch, because the attack patterns evolved faster than the static Critic could handle.

## Why This Matters

If you're deploying LLMs in production without verification, you're shipping 86% hallucinations. In a customer support chatbot, that's annoying. In an HR policy assistant, that's a legal liability. In a medical triage system, that's dangerous.

Single-model guardrails catch format errors. They miss semantic hallucinations — claims that *sound* right, use the *right format*, cite *plausible-looking* sources, but are fundamentally wrong.

The tribunal catches them because the Critic is actively looking for what's wrong, not passively evaluating what's right. And the red-team loop keeps the Critic calibrated against the latest attack patterns.

## Try It

The tribunal is live. You can:
- **Watch it debate** at our [public playground](https://aether.sf2x.com/playground)
- **Check our benchmark** at the [leaderboard](https://aether.sf2x.com/benchmark)
- **Integrate it** via our [API](https://aether.sf2x.com/api-docs)
- **Add it to your browser** with our [Chrome extension](https://aether.sf2x.com/extension)

Don't trust. Verify.

---

*This post is itself verified by the Aether tribunal. Trust score: 94/100. Warrant ID: 6a6de04b26cf84c8aa37847f.*
