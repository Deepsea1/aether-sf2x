# Aether by SF2X — Social Media Posts

---

## TWITTER/X THREAD (9 tweets)

**Tweet 1 (hook)**
We benchmarked how often LLMs hallucinate.

The results are worse than anyone thinks.

Plain LLM: 14/100 trustworthy
Vanilla RAG: 28/100
Baseline LLM: 39/100
Our tribunal system: 91/100

Here's how we did it 🧵

**Tweet 2 (the problem)**
LLMs don't know when they're wrong.

They sound confident. They cite fake sections. They invent "Section 4.1: Paid Time Off" that doesn't exist.

We tested a single model on "Who won the 2028 FIFA World Cup?"

It fabricated details. Confidence was high. It was completely wrong.

**Tweet 3 (the solution)**
We built a 3-model tribunal:

1️⃣ Proposer generates an answer
2️⃣ Critic challenges every claim
3️⃣ Verifier renders a verdict with trust score

The tribunal caught the false premise on the World Cup question. Single model: 0.2 correctness. Tribunal: 1.0.

**Tweet 4 (the data)**
We ran a correlation audit across 24 test items:

- AUC: 1.0
- Pearson r: 0.98
- Perfect separation: true claims averaged 91 trust, hallucinated claims averaged 0

No ambiguity. The tribunal knows what it doesn't know.

**Tweet 5 (warrants)**
Every answer gets a warrant:
- Stated premises
- Cited sources with snapshots
- Signed hash
- Confidence score
- Expiry date

If a premise is unsupported, the warrant is invalidated. No warrant = no trust score = no ship.

**Tweet 6 (red team)**
We added a red-team loop that generates adversarial attacks against the system.

With red-team enabled: 91/100, drift score 0.16, correction time 38s
Without: 58/100, drift score 0.88, correction time 4,131s

The loop is the difference between certified and not.

**Tweet 7 (what it catches)**
The tribunal catches things single models miss:
- Fabricated citations (fake section numbers)
- False premises (questions with built-in lies)
- Adversarial tone (framing management as "wrong")
- Missing PII warnings (telling users to paste docs without redacting)
- Missing disclaimers (no "check your contract" on HR questions)

**Tweet 8 (the playground)**
We're launching a public playground.

Submit any question. Watch the tribunal debate it in real time:
→ Proposer answers
→ Critic challenges
→ Verifier renders verdict + trust score

It's like watching 3 AIs argue about whether the first one is lying.

https://aether.sf2x.com/playground

**Tweet 9 (CTA)**
Benchmark data, methodology, and tribunal lift audits are all public.

See how your system compares: https://aether.sf2x.com/benchmark

Pricing starts at $0 (free tier, 500 API calls) → $399/mo Pro → $1,999 Enterprise → $9,999 Scale

We're preparing for public launch. Try it: https://aether.sf2x.com

---

## LINKEDIN POST

We just benchmarked AI trustworthiness across 5 systems. The gap is staggering.

Plain LLM (no guardrails): 14/100
Vanilla RAG: 28/100
Baseline LLM: 39/100
RAG + Output Validation: 51/100
Aether by SF2X (tribunal + red-team): 91/100, certified

Here's what we built:

A 3-model tribunal — proposer, critic, verifier — that debates every answer before it ships. The proposer generates a response. The critic challenges every claim. The verifier renders a verdict with a trust score, corrections, and a recommendation (approve, re-run, or kill-switch).

Every answer gets a warrant: stated premises, cited sources, a signed hash, and a confidence score. If a premise can't be supported, the warrant is invalidated.

The results speak for themselves:
• AUC 1.0, Pearson r=0.98 — perfect separation between true and hallucinated claims
• 95% warrant rate
• 38-second mean time to correction (vs 300s for plain LLM)
• Drift score 0.16 (vs 0.74 for plain LLM)

We also run a red-team loop that generates adversarial attacks against the system continuously. With it enabled, we score 91/100 and are certified. Without it, we drop to 58. The loop is non-negotiable.

We're launching a public playground where anyone can submit a question and watch the tribunal render a verdict in real time — and a public benchmark leaderboard comparing systems.

If your team is deploying LLMs in production without verification, you're shipping 86% hallucinations and calling it features.

Benchmark: https://aether.sf2x.com/benchmark
Playground: https://aether.sf2x.com/playground
Pricing: https://aether.sf2x.com/pricing

#AI #LLM #TrustWorthyAI #AISafety #Hallucination #MachineLearning #AIGovernance

---

## HACKER NEWS — Show HN

**Title:** Show HN: We benchmarked LLM trustworthiness – plain LLM scores 14/100, our tribunal scores 91/100

**Text:**
We built Aether, an AI trust verification system that uses a 3-model tribunal (proposer → critic → verifier) to catch LLM hallucinations at inference time.

**Benchmark results (trustworthiness scores):**
- Plain LLM (no guardrails): 14/100
- Vanilla RAG: 28/100
- Baseline LLM: 39/100
- RAG + Output Validation: 51/100
- SF2X + red-team loop: 91/100, certified

**How it works:**
1. Proposer model generates an answer
2. Critic model challenges every premise and claim
3. Verifier model renders a verdict: trust score, corrections, and recommendation (approve / re-run / kill-switch)
4. Every answer gets a warrant: premises, cited sources with snapshots, signed hash, confidence score, expiry date

**Key metrics:**
- AUC: 1.0, Pearson r: 0.98 — perfect separation between true and hallucinated claims across 24 test items
- Warrant rate: 95%
- Mean time to correction: 38 seconds (vs 300s for plain LLM)
- Drift score: 0.16 (vs 0.74 for plain LLM)
- Resistance rate: 91% (vs 10% for plain LLM)

**The red-team loop matters:**
With red-team loop enabled: 91/100, drift 0.16, correction time 38s
Without: 58/100, drift 0.88, correction time 4,131s

The loop generates adversarial attacks against the system continuously and feeds corrections back into the pipeline.

**What the tribunal catches that single models miss:**
- Fabricated citations (one LLM invented "Section 4.1: Paid Time Off" — doesn't exist)
- False premises (asked "Who won the 2028 World Cup?" — single model fabricated details, tribunal caught it)
- Adversarial outputs (aggressive tone, missing PII warnings, missing legal disclaimers)
- Trust score collapse (detects when a model's confidence is high but claims are unsupported)

**What's public:**
- Benchmark leaderboard: https://aether.sf2x.com/benchmark
- Tribunal playground (submit a question, watch the verdict): https://aether.sf2x.com/playground
- Pricing: Free tier (500 API calls) → Pro $399/mo → Enterprise $1,999/mo → Scale $9,999/mo

Happy to answer questions about the methodology, the tribunal architecture, or the benchmark.

---

## REDDIT (r/MachineLearning)

**Title:** [D] We benchmarked LLM trustworthiness across 5 systems. Plain LLM: 14/100. Our tribunal: 91/100. AUC 1.0, Pearson r=0.98.

**Body:**
We've been working on Aether by SF2X — a trust verification layer for LLMs that uses a 3-model tribunal to catch hallucinations at inference time.

The benchmark compares 5 systems on trustworthiness:
- Plain LLM: 14/100 (86% hallucination rate)
- Vanilla RAG: 28/100
- Baseline LLM: 39/100
- RAG + Output Validation: 51/100
- SF2X + red-team loop: 91/100, certified

The tribunal architecture is: proposer generates answer → critic challenges every claim → verifier renders verdict with trust score, corrections, and recommendation. Every answer gets a warrant (premises, sources, signed hash, confidence).

Correlation audit across 24 items: AUC 1.0, Pearson r=0.98, perfect separation (true claims avg 91 trust, hallucinated avg 0).

The red-team loop is what makes the difference: 91/100 with it, 58/100 without. It generates adversarial attacks continuously and feeds corrections back.

We're launching a public playground where you can submit questions and watch the tribunal work. Would love feedback from the community on the methodology and whether this approach scales.

Playground: https://aether.sf2x.com/playground
Benchmark: https://aether.sf2x.com/benchmark

---

## BLUESKY / MASTODON (short post)

We benchmarked LLM trustworthiness.

Plain LLM: 14/100
Vanilla RAG: 28/100
Our tribunal (3-model debate + red-team loop): 91/100

AUC 1.0. Pearson r=0.98. Perfect separation between true and hallucinated claims.

Every answer gets a warrant with sources and a signed hash. The tribunal catches fake citations, false premises, and adversarial outputs that single models miss.

Public playground launching soon — submit a question, watch 3 AIs debate whether the first one is telling the truth.

https://aether.sf2x.com

---
