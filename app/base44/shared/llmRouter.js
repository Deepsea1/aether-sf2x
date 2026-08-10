// Central LLM router — the single most important cost control in the app.
// Routes InvokeLLM-shaped calls through OpenRouter (app's own key, 0 Base44
// integration credits) when possible, falling back to Base44 InvokeLLM (which
// costs credits) only when allowed. Every high-volume verification path should
// go through callLLMJson instead of svc.integrations.Core.InvokeLLM directly.
//
// Why this exists: running red-team on every answer + the verify/inquire paths
// were burning the Base44 credit pool (InvokeLLM ~3 credits/call). OpenRouter
// calls cost $0 Base44 credits — they bill the OPENROUTER_API_KEY account instead.

import { secrets } from 'base44:runtime';
import { callOpenRouterJson } from './openrouter.js';
import { callAnthropicJson } from './anthropic.js';

const DEFAULT_OR_MODEL = 'anthropic/claude-3.5-sonnet';
const DEFAULT_B44_MODEL = 'claude_opus_4_8';
const DEFAULT_BUDGET = 80000;

// callLLMJson — returns parsed JSON. 3-tier fallback:
//   1. Anthropic direct (Claude models, 0 Base44 credits, 0 OR markup)
//   2. OpenRouter (0 Base44 credits, small OR markup)
//   3. Base44 InvokeLLM (last resort, costs credits)
// BYOK (orKey set) never falls back to app credits.
export async function callLLMJson(svc, {
  prompt, schema, orModel = DEFAULT_OR_MODEL, b44Model = DEFAULT_B44_MODEL, allowFallback = true, orKey = null,
}) {
  // Tier 1: Anthropic direct for Claude-family models
  if (!orKey && orModel.startsWith('anthropic/')) {
    try {
      return await callAnthropicJson(prompt, b44Model);
    } catch (e) { /* fall through to OpenRouter */ }
  }
  // Tier 2: OpenRouter
  const key = orKey || secrets.get('OPENROUTER_API_KEY');
  if (key) {
    try {
      return await callOpenRouterJson(prompt, orModel, orKey);
    } catch (e) {
      if (!allowFallback || orKey) throw e;
    }
  }
  // Tier 3: Base44 InvokeLLM
  const res = await svc.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: b44Model });
  return (res && res.data) ? res.data : res;
}

// Lightweight monthly LLM budget gate. Uses the Inquiry count for the current
// month as a proxy for LLM call volume (every verify/inquire creates one).
// When exceeded, callers should degrade (return cached / 429) instead of
// burning more Base44 credits on the web-grounded path. Cap is overridable via
// the SF2X_LLM_BUDGET secret.
export async function checkLlmBudget(svc) {
  const cap = Number(secrets.get('SF2X_LLM_BUDGET')) || DEFAULT_BUDGET;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const used = await svc.entities.Inquiry.filter({ created_date: { $gte: monthStart.toISOString() } });
  return { allowed: used.length < cap, used: used.length, cap };
}