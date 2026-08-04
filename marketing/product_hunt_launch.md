# Product Hunt Launch Strategy & Content — Aether by SF2X

---

## 1. Product Name
**Aether by SF2X**

---

## 2. Tagline
> **Catch AI hallucinations in real time with a 3-model tribunal**
*(Length: 60 characters | Max limit: 60 characters)*

*Alternative short option:*
> **Real-time AI trust verification via a 3-model tribunal**
*(Length: 54 characters)*

---

## 3. Description
> **Aether by SF2X is an AI trust verification layer that catches hallucinations in real time. Powered by a 3-model tribunal (proposer, critic, verifier), it boosts trust scores from 14/100 to 91/100. Features a Chrome extension & live public playground.**
*(Length: 250 characters | Max limit: 260 characters)*

---

## 4. Key Features (3 Bullet Points)

1. **3-Model Tribunal Architecture (Proposer → Critic → Verifier)**
   Unlike single-model guardrails, Aether routes prompts through a tri-model consensus pipeline. A **Proposer** generates initial responses, a **Critic** red-teams for false premises, fabricated citations, and logical gaps, and a **Verifier** issues a final trust score and warrant.

2. **One-Click Chrome Extension for ChatGPT, Claude & Gemini**
   Injects a seamless *"Verify with Aether"* button directly next to AI chat responses on popular platforms. With one click, users can run an instant tribunal check without leaving their workflow.

3. **Audit-Ready Warrants & Interactive Public Playground**
   Every verified output produces a cryptographic warrant detailing verified premises, validated source citations, and signed hashes. Test prompts in real time on our public playground (`https://aether.sf2x.com/playground`) or audit historical debate logs.

---

## 5. First Comment (Maker Comment)

```markdown
Hey Product Hunt! 👋

I'm Cameron Piper, maker of Aether by SF2X.

### Why We Built Aether
Like many of you, our team relies on LLMs daily for research, code, and decision-making. But as models became more persuasive, a dangerous problem emerged: they don't just fail; they hallucinate with absolute confidence. From inventing non-existent company policies to fabricating scientific citations and missing false premises, single models simply cannot reliably self-correct.

We asked a fundamental question: **How can we trust AI outputs in production when single-model guardrails fail?**

### The Solution: A 3-Model Tribunal Architecture
Instead of relying on a single LLM to mark its own homework, Aether introduces an inference-time 3-model tribunal that debates and verifies every response:

1. **The Proposer**: Generates the primary output and underlying reasoning based on context and prompts.
2. **The Critic**: Adversarially red-teams the answer—actively hunting for fabricated citations, false assumptions, tone shifts, and hallucinated facts.
3. **The Verifier**: Evaluates the arguments from both Proposer and Critic, synthesizes source evidence, and issues a final trust verdict and signed warrant.

### The Benchmark Results 📊
We benchmarked Aether against standard LLM setups across adversarial datasets:
- **Plain LLM (No guardrails)**: 14/100 trust score (86% hallucination/error rate)
- **Vanilla RAG**: 28/100
- **Baseline LLM with prompt guardrails**: 39/100
- **Aether Tribunal**: **91/100 (Certified Trustworthy)**
- **Statistical Rigor**: Achieved **AUC 1.0** and **Pearson r = 0.98**, demonstrating near-perfect separation between factual and hallucinated claims.

### Try It Yourself Today 🚀
We wanted to make AI trust accessible to everyone:
1. **Chrome Extension**: Adds a "Verify with Aether" button next to any response on ChatGPT, Claude, and Gemini. Catch hallucinations in your web browser with a single click.
2. **Public Playground**: Visit [aether.sf2x.com/playground](https://aether.sf2x.com/playground) to test your own prompts, watch the tribunal debate in real time, and inspect complete cryptographic warrants.

We'd love for the PH community to give it a spin! What's the wildest hallucination you've caught an AI generating? Let us know your thoughts, feedback, and questions below—I'll be here all day replying!

— Cameron & the SF2X team
```

---

## 6. Recommended Topics & Tags
When setting up the listing on Product Hunt, select these primary topics for maximum reach and discoverability:
- **Artificial Intelligence** (Primary)
- **Developer Tools**
- **Chrome Extensions**
- **Productivity**
- **Tech / AI Safety**

---

## 7. Recommended Launch Day & Timing

### **Recommended Day: Tuesday or Wednesday**
- **Optimal Time**: **12:01 AM PST (Pacific Standard Time)** on launch day.

### **Why Tuesday or Wednesday?**
1. **Peak Active Traffic**: Product Hunt sees its highest site traffic, active maker discussions, and tech industry visitor engagement on Tuesdays and Wednesdays.
2. **Newsletter Feature Eligibility**: Product Hunt's daily digest newsletter goes out every weekday morning. Launching at 12:01 AM PST on Tuesday/Wednesday maximizes the 24-hour voting window prior to the newsletter send.
3. **Hunter & Investor Reach**: Enterprise buyers, tech journalists, and VC talent scouts check Product Hunt most actively mid-week.

---

## 8. Gallery Image & Visual Assets Suggestions

To convert visitors into upvoters and users, upload 5–6 crisp, 16:9 ratio screenshots/visuals:

| # | Asset Name | Description & Visual Details |
|---|------------|------------------------------|
| **1** | **Hero Banner (Main Graphic)** | High-contrast visual displaying the Aether logo, tagline *"The Truth Layer for AI"*, and a sleek graphic of 3 AI models debating an output with a bold "91/100 Certified" trust badge. |
| **2** | **Benchmark Performance Comparison** | A clean bar chart comparing Plain LLM (14/100), Vanilla RAG (28/100), Baseline (39/100), and Aether Tribunal (91/100). Highlight key metrics: **AUC 1.0** and **Pearson r = 0.98**. |
| **3** | **3-Model Tribunal Flow Diagram** | An architectural visualization showing the step-by-step pipeline: **Input Prompt → Proposer → Critic (Red-Team Audit) → Verifier → Signed Cryptographic Warrant**. |
| **4** | **Chrome Extension In-Action** | Screenshot showing ChatGPT / Claude interface with the injected **"✓ Verify with Aether"** button and an expanded side-drawer displaying real-time fact-checking results. |
| **5** | **Public Playground UI** | Full-screen screenshot of the interactive public playground (`aether.sf2x.com/playground`) showing a live prompt input, tribunal debate transcript, and trust score output. |
| **6** | **Trust Warrant & Audit Detail** | Detailed close-up of an Aether Verification Warrant showing premise decomposition, source citations, and cryptographic signed hash. |

---
