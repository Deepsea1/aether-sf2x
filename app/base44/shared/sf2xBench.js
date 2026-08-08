// Shared model-arena logic used by the runModelBench backend function.
// The frontend keeps its own copy of ALL_MODELS in src/lib/sf2xBench.js.

export const ALL_MODELS = [
  { value: 'automatic', label: 'Base44 Auto', tag: 'Base44' },
  { value: 'gpt_5_6_sol', label: 'GPT-5.6 Sol', tag: 'OpenAI' },
  { value: 'gpt_5_4', label: 'GPT-5.4', tag: 'OpenAI' },
  { value: 'gpt_5_mini', label: 'GPT-5 Mini', tag: 'OpenAI' },
  { value: 'gemini_3_1_pro', label: 'Gemini 3.1 Pro', tag: 'Google' },
  { value: 'gemini_3_flash', label: 'Gemini 3 Flash', tag: 'Google' },
  { value: 'claude_opus_4_8', label: 'Claude Opus 4.8', tag: 'Anthropic' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5', tag: 'Anthropic' },
  { value: 'claude_sonnet_4_6', label: 'Claude Sonnet 4.6', tag: 'Anthropic' },
  // OpenRouter-routed multi-provider models (callOpenRouter in runModelBench)
  { value: 'or_grok_4_3', label: 'Grok 4.3', tag: 'xAI', openrouter: true, or_model: 'x-ai/grok-4.3' },
  { value: 'or_llama_33_70b', label: 'Llama 3.3 70B', tag: 'Meta', openrouter: true, or_model: 'meta-llama/llama-3.3-70b-instruct' },
  { value: 'or_mistral_large', label: 'Mistral Large', tag: 'Mistral', openrouter: true, or_model: 'mistralai/mistral-large-2411' },
  { value: 'or_deepseek_v3', label: 'DeepSeek V3', tag: 'DeepSeek', openrouter: true, or_model: 'deepseek/deepseek-chat' },
  { value: 'or_qwen_25_72b', label: 'Qwen 2.5 72B', tag: 'Qwen', openrouter: true, or_model: 'qwen/qwen-2.5-72b-instruct' },
  // Broader multi-firm coverage via OpenRouter
  { value: 'or_cohere_rplus', label: 'Command R+', tag: 'Cohere', openrouter: true, or_model: 'cohere/cohere-command-r-plus-08-2024' },
  { value: 'or_perplexity_sonar', label: 'Sonar Pro', tag: 'Perplexity', openrouter: true, or_model: 'perplexity/sonar-pro' },
  { value: 'or_nvidia_nemotron', label: 'Nemotron 70B', tag: 'NVIDIA', openrouter: true, or_model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
  { value: 'or_ai21_jamba', label: 'Jamba 1.5 Large', tag: 'AI21', openrouter: true, or_model: 'ai21/jamba-1.5-large' },
  { value: 'or_phi3_medium', label: 'Phi-3 Medium', tag: 'Microsoft', openrouter: true, or_model: 'microsoft/phi-3-medium-128k-instruct' },
  { value: 'or_nova_pro', label: 'Nova Pro', tag: 'Amazon', openrouter: true, or_model: 'amazon/nova-pro-v1.0' },
];

export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Candidate id, e.g. m0.' },
          correctness: { type: 'number', description: '0-1 factual + epistemic correctness vs the best answer.' },
          notes: { type: 'string', description: 'Terse rationale.' },
        },
        required: ['id', 'correctness'],
      },
    },
    winner_ids: { type: 'array', items: { type: 'string' }, description: 'Ids tied for top correctness (within 0.03).' },
  },
  required: ['rankings', 'winner_ids'],
};

export function buildVerifierPrompt(question, candidates) {
  const block = candidates
    .map((c) => `${c.id} (Model: ${c.model}):\n"""${c.answer || ''}"""`)
    .join('\n\n');
  return `You are the SF2X Bench verifier — an impartial judge scoring candidate answers to one question.

QUESTION:
"""${question}"""

CANDIDATES:
${block}

Score each candidate 0-1 for factual correctness and epistemic quality:
- 1.0 = fully correct, well-warranted, no errors
- 0.6 = mostly correct with minor gaps
- 0.3 = partially correct / misleading
- 0.0 = wrong, fabricated, or unsafe

Then set winner_ids to every id whose correctness is within 0.03 of the top score (ties allowed).
Return rankings [{id, correctness, notes}] and winner_ids. Be strict and impartial.`;
}

export function buildQuestionOfDayPrompt() {
  return `Pose the single most pressing, factually-resolvable question in AI, technology, or science today that a well-calibrated model should answer correctly. It must have a determinate correct answer (not opinion or preference). Return only the question.`;
}