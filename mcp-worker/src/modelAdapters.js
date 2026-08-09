/**
 * Frontier-model adapters for the diagnostic matrix.
 *
 * One tiny fetch per vendor behind a single interface: `generate(model, prompt, env)`
 * → answer string. Each adapter is only ever reached when its key is configured
 * (see `availableModels` in compare.js), so this file cannot spend money that the
 * operator has not explicitly enabled by setting a secret.
 *
 * COST DISCIPLINE. Every call is capped by `maxTokens` and a wall-clock timeout, and
 * a vendor error is returned as a thrown Error with the status so the matrix can show
 * that model as `errored` rather than silently comparing fewer models. Nothing here
 * retries: a retry loop across four vendors is an easy way to multiply a bill.
 */

/** Hard cap on generated length — a diagnostic answer does not need to be long. */
export const MAX_OUTPUT_TOKENS = 600;
/** Wall-clock cap per vendor call. */
export const VENDOR_TIMEOUT_MS = 30000;

async function postJson(url, { headers, body, timeoutMs = VENDOR_TIMEOUT_MS, fetchImpl = fetch }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = json?.error?.message || json?.message || `HTTP ${res.status}`;
      throw new Error(`${res.status}: ${detail}`);
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`vendor timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

/**
 * VENDOR_ADAPTERS — keyed by the `vendor` field of MODEL_REGISTRY.
 * Each returns the model's answer text, or throws with a readable reason.
 */
export const VENDOR_ADAPTERS = {
  async openai(model, prompt, env, opts = {}) {
    const json = await postJson('https://api.openai.com/v1/chat/completions', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      },
      ...opts,
    });
    return firstNonEmpty(json?.choices?.[0]?.message?.content);
  },

  async anthropic(model, prompt, env, opts = {}) {
    const json = await postJson('https://api.anthropic.com/v1/messages', {
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
      ...opts,
    });
    const blocks = Array.isArray(json?.content) ? json.content : [];
    return firstNonEmpty(blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('\n'));
  },

  async google(model, prompt, env, opts = {}) {
    const json = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        headers: { 'x-goog-api-key': env.GOOGLE_API_KEY },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        },
        ...opts,
      },
    );
    const parts = json?.candidates?.[0]?.content?.parts;
    return firstNonEmpty(Array.isArray(parts) ? parts.map((p) => p?.text || '').join('') : '');
  },

  // Llama is served via Groq's OpenAI-compatible endpoint — no separate Meta API.
  async meta(model, prompt, env, opts = {}) {
    const json = await postJson('https://api.groq.com/openai/v1/chat/completions', {
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
      },
      ...opts,
    });
    return firstNonEmpty(json?.choices?.[0]?.message?.content);
  },
};

/**
 * makeGenerate — build the `generate` adapter runComparison expects, resolving each
 * model id to its vendor via the registry. Throws for a model with no adapter rather
 * than returning empty text, so it surfaces as an errored row.
 */
export function makeGenerate(registry, env, opts = {}) {
  return async function generate(modelId, prompt) {
    const spec = registry[modelId];
    if (!spec) throw new Error(`unknown model id "${modelId}"`);
    const adapter = VENDOR_ADAPTERS[spec.vendor];
    if (!adapter) throw new Error(`no adapter for vendor "${spec.vendor}"`);
    if (!String(env[spec.envKey] || '').trim()) throw new Error(`${spec.envKey} is not configured`);
    return adapter(modelId, prompt, env, opts);
  };
}

/**
 * makeVerify — build the `verify` adapter, calling the SAME Aether warrantApi the MCP
 * tools use. `model_label` records which model produced the text so the warrant's
 * provenance is honest about what was verified.
 */
export function makeVerify(env, { domain = 'General', fetchImpl = fetch } = {}) {
  return async function verify(answer, modelId) {
    const apiUrl = String(env.AETHER_WARRANT_API_URL || '').trim();
    if (!apiUrl) throw new Error('AETHER_WARRANT_API_URL is not configured');

    return postJson(apiUrl, {
      headers: { 'x-api-key': env.AETHER_API_KEY || '' },
      body: {
        answer_text: answer,
        domain,
        sources: [],
        model_label: `compare:${modelId}`,
      },
      fetchImpl,
    });
  };
}
