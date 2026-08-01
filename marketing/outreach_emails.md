# Aether by SF2X — Outreach Email Templates

## Template 1: AI Safety / Governance Teams

Subject: We benchmarked how often LLMs hallucinate. The numbers are bad.

Hi [Name],

I'm Cameron, building Aether by SF2X — an AI trust verification system that catches LLM hallucinations in real time using a multi-model tribunal.

We just ran benchmarks comparing trust scores across systems:
- Plain LLM (no guardrails): 14/100
- Vanilla RAG: 28/100
- Baseline LLM: 39/100
- Our system (SF2X + red-team loop): 91/100, certified

The tribunal catches false premises, fabricated citations, and adversarial outputs that single models miss — and it does this at inference time, not post-hoc. We achieved AUC 1.0 and Pearson r=0.98 separating true claims from hallucinated ones across our test set.

I think this is directly relevant to [their work/team], and I'd love to show you the tribunal in action. We're building a public playground where anyone can submit a question and watch the tribunal render a verdict in real-time.

Would you be open to a 15-minute walkthrough?

Best,
Cameron Piper
Aether by SF2X
https://aether.sf2x.ai

---

## Template 2: ML Engineering Leaders

Subject: Your LLM is hallucinating 86% of the time. Here's the data.

Hi [Name],

I'm Cameron from SF2X. We built a benchmark that measures how trustworthy AI answers actually are — not how fluent they sound.

The results are stark:
- Plain LLM: 14% trustworthy
- Standard RAG: 28% trustworthy  
- Our tribunal system: 91% trustworthy, certified

We use a 3-model tribunal (proposer → critic → verifier) that catches fabrications, false premises, and adversarial outputs at inference time. Every answer gets a warrant with premises, sources, and a signed hash.

I know [Company] is deploying AI in production — how are you currently verifying model outputs aren't hallucinating?

Happy to show you the benchmark data and a live demo. 15 minutes.

Best,
Cameron Piper
Aether by SF2X
https://aether.sf2x.ai

---

## Template 3: AI Newsletter Writers / Journalists

Subject: Benchmark: LLMs hallucinate 86% of the time (and we can catch it)

Hi [Name],

I'm Cameron, building Aether by SF2X — an AI trust layer that catches LLM hallucinations in real time.

We just published benchmark data that your readers would care about:
- We tested 5 systems on trustworthiness using warrant-based verification
- Plain LLM scored 14/100 (86% hallucination rate)
- Our tribunal system scored 91/100, certified
- We achieved AUC 1.0 and Pearson r=0.98 separating true from false claims

The system uses a 3-model tribunal (proposer, critic, verifier) that debates each answer and issues a trust score. It catches false premises, fabricated citations, and adversarial outputs that single models miss.

We're launching a public playground where anyone can submit a question and watch the tribunal work in real time — I think it'd make a great story for [newsletter/publication].

Want early access before we go public?

Best,
Cameron Piper
Aether by SF2X
https://aether.sf2x.ai

---

## Template 4: Hacker News / Social Media Post

**Title:** Show HN: We benchmarked LLM trustworthiness — plain LLM scores 14/100, our tribunal scores 91/100

**Body:** 
We built Aether, an AI trust verification system that uses a 3-model tribunal (proposer → critic → verifier) to catch LLM hallucinations at inference time.

We benchmarked 5 systems on trustworthiness:
- Plain LLM (no guardrails): 14/100 — 86% hallucination rate
- Vanilla RAG: 28/100
- Baseline LLM: 39/100
- RAG + Output Validation: 51/100
- SF2X + red-team loop: 91/100, certified

Key metrics:
- AUC 1.0, Pearson r=0.98 separating true from hallucinated claims
- Warrant rate: 95% (every answer gets premises, sources, signed hash)
- Mean time to correction: 38 seconds (vs 300s for plain LLM)
- Drift score: 0.16 (vs 0.74 for plain LLM)

The tribunal catches:
- Fabricated citations (one LLM invented "Section 4.1: Paid Time Off" that doesn't exist)
- False premises (asked "Who won the 2028 World Cup?" — single model fabricated details, tribunal caught it)
- Adversarial outputs (tone, PII leaks, missing disclaimers)

We're building a public playground where you can submit any question and watch the tribunal render a verdict. The benchmark methodology, correlation audit, and tribunal lift data are all open.

Try it: https://aether.sf2x.ai/playground
Benchmark: https://aether.sf2x.ai/benchmark

---
