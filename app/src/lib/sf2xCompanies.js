// Shared company metadata + dedup helpers for the model arena, trend chart,
// and global rank strip. Keeps "one entry per company (its top model)" so we
// never show duplicate vendors and only run the frontier models by default.

import { ALL_MODELS } from '@/lib/sf2xBench';

export const COMPANY_META = {
  OpenAI: { tone: 'text-emerald-300 bg-emerald-400/10', mono: 'G', color: '#34D399' },
  Google: { tone: 'text-sky-300 bg-sky-400/10', mono: 'G', color: '#38BDF8' },
  Anthropic: { tone: 'text-amber-300 bg-amber-400/10', mono: 'C', color: '#FBBF24' },
  Base44: { tone: 'text-slate-300 bg-white/5', mono: 'B', color: '#94A3B8' },
  xAI: { tone: 'text-zinc-200 bg-zinc-400/10', mono: 'X', color: '#E4E4E7' },
  Meta: { tone: 'text-blue-300 bg-blue-400/10', mono: 'M', color: '#60A5FA' },
  Mistral: { tone: 'text-orange-300 bg-orange-400/10', mono: 'M', color: '#FB923C' },
  DeepSeek: { tone: 'text-violet-300 bg-violet-400/10', mono: 'D', color: '#A78BFA' },
  Qwen: { tone: 'text-rose-300 bg-rose-400/10', mono: 'Q', color: '#FB7185' },
  Cohere: { tone: 'text-teal-300 bg-teal-400/10', mono: 'C', color: '#2DD4BF' },
  Perplexity: { tone: 'text-cyan-300 bg-cyan-400/10', mono: 'P', color: '#22D3EE' },
  NVIDIA: { tone: 'text-lime-300 bg-lime-400/10', mono: 'N', color: '#A3E635' },
  AI21: { tone: 'text-fuchsia-300 bg-fuchsia-400/10', mono: 'A', color: '#E879F9' },
  Microsoft: { tone: 'text-blue-300 bg-blue-400/10', mono: 'M', color: '#60A5FA' },
  Amazon: { tone: 'text-orange-300 bg-orange-400/10', mono: 'A', color: '#FB923C' },
};

export const COMPANY_OF_MODEL = new Map(ALL_MODELS.map((m) => [m.value, m.tag]));

// The frontier "top model" from each major company — the only models we run by
// default to keep credit usage bounded. Users can swap to alternates per company.
export const DEFAULT_TOP_MODELS = [
  'gpt_5_6_sol', 'gemini_3_1_pro', 'claude_opus_4_8',
  'or_grok_4', 'or_llama_33_70b', 'or_mistral_large', 'or_deepseek_v3', 'or_qwen_25_72b',
];

// Models run by the Daily Model Arena workflow every day. They accumulate far more
// runs than on-demand models, so charts/tables group them separately with a clear
// "daily tracked" label so the run-count disparity is self-explanatory.
export const DAILY_ARENA_MODELS = new Set(DEFAULT_TOP_MODELS);
export const isDailyTrackedModel = (model) => DAILY_ARENA_MODELS.has(model);

// Hard credit limit: max models per arena run (each model = 1 LLM call + 1 shared verifier).
export const MAX_ARENA_MODELS = 8;

// Default cross-firm tribunal trio — three independent labs (Anthropic, Google,
// OpenAI). Users can swap any of the three from the Console picker.
export const DEFAULT_TRIO = ['claude_opus_4_8', 'gemini_3_1_pro', 'gpt_5_6_sol'];

export function companyMeta(c) {
  return COMPANY_META[c] || { tone: 'text-slate-400 bg-white/5', mono: (c || '?').slice(0, 1), color: '#94A3B8' };
}

export function companyColor(c) {
  return companyMeta(c).color;
}

export function modelsByCompany(models = ALL_MODELS) {
  const map = new Map();
  for (const m of models) {
    if (!map.has(m.tag)) map.set(m.tag, []);
    map.get(m.tag).push(m);
  }
  return map;
}

// Pick the highest-scoring row per company. scoreOf(row) => number (higher is better).
export function topModelPerCompany(rows, scoreOf) {
  const byCo = new Map();
  for (const r of rows) {
    const co = r.company || COMPANY_OF_MODEL.get(r.model) || '—';
    if (!byCo.has(co) || scoreOf(r) > scoreOf(byCo.get(co))) byCo.set(co, r);
  }
  return [...byCo.values()].sort((a, b) => scoreOf(b) - scoreOf(a));
}