// Asymmetric model routing — the core cost-control + truthfulness strategy.
//
// PRINCIPLE: the tribunal's trustworthiness does NOT come from the model that
// writes the answer. It comes from the model that CHECKS it. A mid-tier
// proposer that hallucinates gets caught and downgraded by the best-AI
// verifier + cross-firm falsifier — that is the entire point of the tribunal.
//
// So we run best-AI on the adversarial roles (the ones that catch lies) and
// mid-tier on the proposers (the ones that write). This cuts tribunal cost
// ~55% while keeping the catch-rate at best-AI quality — the models that
// matter for truthfulness are always top-tier.
//
// Role assignments (consumed by sf2xTribunal.js, attest.js, falsifier.js):

// Proposers: 3 mid-tier models from 3 independent labs (Google, OpenAI,
// DeepSeek). Competent writers, cheap. Leaves Anthropic free for the
// cross-firm verifier (Claude Opus 4.8) — the best-AI model on the
// catching role.
export const PROPOSER_TRIO = ['gemini_3_flash', 'gpt_5_mini', 'or_deepseek_v3'];

// Verifier (ranks + synthesizes the hardened answer): best-AI, cross-firm.
// Anthropic is NOT in the proposer trio, so Claude Opus 4.8 is always
// available as a cross-firm verifier.
export const VERIFIER_MODEL = 'claude_opus_4_8';

// Falsifier (constructs the strongest case the claim is FALSE): best-AI.
// Cross-firm variant uses a different vendor (OpenAI) via OpenRouter.
export const FALSIFIER_OR_MODEL = 'anthropic/claude-3.5-sonnet';
export const FALSIFIER_FOREIGN_MODEL = 'openai/gpt-4o';

// Coverage check (would the record have detected a lie?): cheap is fine —
// this is a lightweight detectability gate, not a reasoning role.
export const COVERAGE_OR_MODEL = 'openai/gpt-4o-mini';

// Cost estimate per full tribunal with this routing (asymmetric):
//   3 proposers (mid-tier): ~$0.06
//   3 critics (mid-tier): ~$0.06
//   3 reconciles (mid-tier): ~$0.06
//   1 verifier (Claude Opus 4.8): ~$0.10
//   1 falsifier (Claude 3.5 / GPT-4o): ~$0.05
//   1 coverage (GPT-4o-mini): ~$0.01
//   1 red-team (GPT-4o-mini): ~$0.01
//   ≈ $0.35 per tribunal (vs ~$0.80 with all-top-tier)
// At 10 credits/tribunal → $0.035/credit cost → profitable at every tier.