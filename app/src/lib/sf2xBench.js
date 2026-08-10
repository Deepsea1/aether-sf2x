// Frontend mirror of the model list used by the runModelBench backend function
// (kept in sync with base44/shared/sf2xBench.js).

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

export const DEFAULT_PROMPT =
  'A 52-year-old with no history of cardiovascular disease asks whether they should take a daily low-dose aspirin for prevention. What is the epistemically warranted answer, given current evidence?';