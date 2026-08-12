// Extract a JSON object from an LLM response.
//
// Asking a model for "a single JSON object only" is a request, not a contract.
// Current Claude models frequently prepend a sentence of framing, and the old
// path (`JSON.parse(stripFences(text))`) required the WHOLE response to be
// JSON — so a correct answer with a polite preamble was thrown away as
// "non-JSON". That discarded 18 of 30 items in the 2026-08-12 gate-0 run.
//
// Strategy, cheapest first:
//   1. Parse the whole (trimmed) string.
//   2. Unwrap a ```/```json fence and parse that.
//   3. Scan for the outermost balanced { … }, respecting string literals and
//      escapes so a brace inside a claim ("the set {a, b}") cannot truncate it.
//
// Deliberately object-only: every caller expects an object shape, and quietly
// accepting a bare array would just relocate the failure into schema handling.
// Returns null instead of throwing — the caller decides what an unparseable
// response means.

// Walk from the first '{' to its matching '}', tracking whether we are inside
// a string literal and whether the previous character was an escape. Returns
// the substring or null when no balanced object closes.
function balancedObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseObject(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  try {
    const parsed = JSON.parse(candidate);
    // Arrays and primitives are not the object shape callers expect.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Render a JSON Schema as a compact field contract for the prompt.
 *
 * WHY: llmRouter passed `schema` to the Base44 tier only — the Anthropic call
 * received the prompt and nothing else. VERIFY_SCHEMA marks `confidence` as
 * required and the prompt asked for it in prose, but with no field contract the
 * model returned it under whatever name it chose. `v.confidence` was therefore
 * undefined on every verification, verifierConfidence fell back to 0, and trust
 * was permanently capped at support_ratio x 60 — which is what produced the
 * false-blocks on the critical tier. Naming the fields is the fix.
 *
 * @param {unknown} schema JSON Schema (object type)
 * @returns {string} '' when there is nothing usable to describe
 */
export function describeSchema(schema) {
  if (!schema || typeof schema !== 'object') return '';
  const props = schema.properties;
  if (!props || typeof props !== 'object') return '';
  const names = Object.keys(props);
  if (!names.length) return '';

  const required = Array.isArray(schema.required) ? schema.required : [];
  const lines = names.map((name) => {
    const p = props[name] || {};
    const bits = [p.type || 'any'];
    if (Array.isArray(p.enum) && p.enum.length) bits.push(`one of: ${p.enum.join(' | ')}`);
    if (required.includes(name)) bits.push('required');
    return `  "${name}": ${bits.join(', ')}`;
  });
  return `\n\nReturn EXACTLY these top-level fields, using these exact names:\n${lines.join('\n')}\nOmit nothing that is marked required.`;
}

/**
 * @param {unknown} text raw model output
 * @param {{assumeOpenBrace?: boolean}} [opts] assumeOpenBrace: the assistant
 *   turn was prefilled with '{', so the text starts AFTER that brace.
 * @returns {object|null}
 */
export function extractJsonObject(text, opts = {}) {
  if (typeof text !== 'string') return null;
  const raw = text.trim();
  if (!raw) return null;

  // 1. The whole thing.
  const direct = tryParseObject(raw);
  if (direct) return direct;

  // 2. Fenced block (```json … ``` or ``` … ```).
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const fenced = tryParseObject(fence[1].trim());
    if (fenced) return fenced;
  }

  // 3. Outermost balanced object anywhere in the text.
  const scanned = balancedObject(raw);
  if (scanned) {
    const parsed = tryParseObject(scanned);
    if (parsed) return parsed;
  }

  // 4. Prefilled responses arrive without their opening brace. Tried last so a
  //    complete object in the text always wins over this reconstruction.
  if (opts.assumeOpenBrace) {
    const rebuilt = balancedObject('{' + raw);
    if (rebuilt) {
      const parsed = tryParseObject(rebuilt);
      if (parsed) return parsed;
    }
  }

  return null;
}
