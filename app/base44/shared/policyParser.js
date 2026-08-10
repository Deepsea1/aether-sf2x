// .aether/policy.yml parser — parses repository policy files into the Policy
// entity shape. Supports the spec's YAML format (§7.3):
//
//   version: 1
//   default_action: warn
//   rules:
//     - category: benchmark_claim
//       action: require_verification
//       min_evidence_tier: primary_operational
//     - category: security_claim
//       action: require_human_review
//       min_evidence_tier: primary_authoritative
//   release_gate:
//     block_on:
//       - contradicted
//       - unsupported
//
// v2 (MASTER_PLAN v5 §11.3) is additive: a file is v2 when it says `version: 2`
// (or higher) or uses any v2 top-level key. v1 files parse as they always have
// EXCEPT two shipped parser bugs fixed 2026-08-10 with owner approval: the last
// rule before a following top-level key is no longer dropped, and a sibling
// `require_review_on:` after an open block_on list is no longer swallowed into
// block_on as a literal value (its entries now require review instead of
// blocking, as the policy author intended). Note: v1 policies that hit either
// bug now produce a different computePolicyHash — Policy dedupe re-persists
// once and the wedge's verdict-reuse cache invalidates once (safe
// over-invalidation, by design). v2 adds:
//
//   domain_pack: technical-docs@1.0
//   mode: advisory | enforcing          # absent on a v2 file = advisory
//   scope: { include, ignore, changed_files_only, max_claims_per_run }
//   materiality_rules.floors            # match (path glob) / pattern (regex) → min_materiality
//   sources.allowed                     # entries of exactly { host } or { repo }
//   freshness_days                      # per-source-class map (plain number still accepted)
//   review_sla                          # label: { hours, on_timeout[, escalate_to] } inline maps
//   verdict_reuse                       # { enabled, respect_freshness }
//   release_gate                        # gains review_on (alias), mode, review_sla,
//                                       # degraded_mode, overrides
//
// v2 parsing fails closed: a malformed v2 construct (bad mode, bad
// min_materiality, non-compiling floor regex, non-numeric freshness, …) throws
// with a clear error — a policy the parser cannot fully understand must never
// silently govern a gate. Unknown keys are ignored (forward compatibility),
// exactly as v1 ignores them.
//
// This is a lightweight YAML subset parser — enough for policy files without
// pulling in a full YAML library. Handles indentation-based nesting, lists,
// and key-value pairs.

const VALID_ACTIONS = ['allow', 'warn', 'require_verification', 'require_human_review', 'block_if_stale', 'block', 'ignore'];
const VALID_EVIDENCE_TIERS = ['primary_authoritative', 'primary_operational', 'qualified_secondary', 'unverified_secondary', 'user_supplied'];

// ---- v2 vocabulary (MASTER_PLAN v5 §11.3 / §6.2 / §12.5) ----
const VALID_MODES = ['advisory', 'enforcing'];
const VALID_MATERIALITY = ['low', 'normal', 'high', 'critical']; // ascending rank order
const MATERIALITY_RANK = { low: 0, normal: 1, high: 2, critical: 3 };
const VALID_SLA_TIMEOUTS = ['advisory', 'remain_blocked'];
// Top-level keys that mark a file as v2 (in addition to `version: 2`). Only
// zero-indent lines are scanned, so a v1 rule's nested freshness_days can
// never reclassify a v1 file.
const V2_TOP_KEYS = ['mode', 'domain_pack', 'scope', 'materiality_rules', 'sources', 'freshness_days', 'review_sla', 'verdict_reuse', 'max_claims_per_run', 'changed_files_only'];
// Keys that live directly under release_gate — used to hand a sibling key back
// to the release_gate section when a nested v2 block (review_sla, …) ends.
const RELEASE_GATE_KEYS = ['block_on', 'require_review_on', 'review_on', 'mode', 'review_sla', 'degraded_mode', 'overrides'];

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- v2 helpers ----

function policyError(msg) {
  return new Error(`policy v2: ${msg}`);
}

function stripQuotes(val) {
  const s = String(val ?? '').trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) return s.slice(1, -1);
  return s;
}

// Strip a trailing `# comment` from a v2 value line (the §11.3 example carries
// them). Quote-aware so a # inside a quoted value survives. v1 lines are never
// passed through this — their bytes are untouched.
function stripTrailingComment(line) {
  let inQuote = null;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '#' && j > 0 && /\s/.test(line[j - 1])) return line.slice(0, j).replace(/\s+$/, '');
  }
  return line;
}

function parseScalar(val) {
  const s = stripQuotes(val);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  return s;
}

// `["README.md", "docs/**/*.md"]` inline flow list → array of strings.
function parseInlineList(val) {
  const inner = String(val).trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner.split(',').map((p) => stripQuotes(p)).filter((p) => p !== '');
}

// `{ hours: 72, on_timeout: advisory }` inline flow map → plain object.
function parseInlineMap(val, context) {
  const s = String(val).trim();
  if (!s.startsWith('{') || !s.endsWith('}')) throw policyError(`${context} must be an inline map like { hours: 72, on_timeout: advisory }`);
  const out = {};
  for (const part of s.slice(1, -1).split(',')) {
    if (!part.trim()) continue;
    const idx = part.indexOf(':');
    if (idx === -1) throw policyError(`${context}: entry "${part.trim()}" is not key: value`);
    out[part.slice(0, idx).trim()] = parseScalar(part.slice(idx + 1));
  }
  return out;
}

function positiveNumber(val, context) {
  const n = Number(stripQuotes(val));
  if (!Number.isFinite(n) || n <= 0) throw policyError(`${context} must be a positive number, got "${String(val).trim()}"`);
  return n;
}

function positiveInt(val, context) {
  const n = positiveNumber(val, context);
  if (!Number.isInteger(n)) throw policyError(`${context} must be a positive integer, got "${String(val).trim()}"`);
  return n;
}

function parseBool(val, context) {
  const s = stripQuotes(val);
  if (s === 'true') return true;
  if (s === 'false') return false;
  throw policyError(`${context} must be true or false, got "${s}"`);
}

// Glob-ish path pattern → anchored RegExp. Same semantics as the wedge's scope
// matching: `**` crosses directory boundaries, `*` stays within one segment.
function globToRegExp(glob) {
  const escaped = String(glob || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function finalizeFloor(floor) {
  if (!floor.match && !floor.pattern) throw policyError('materiality_rules.floors entry needs a match (path glob) or pattern (regex)');
  if (!VALID_MATERIALITY.includes(floor.min_materiality)) throw policyError(`materiality_rules.floors entry ("${floor.match || floor.pattern}") min_materiality must be one of ${VALID_MATERIALITY.join('|')}, got "${floor.min_materiality ?? ''}"`);
  if (floor.pattern) {
    try {
      new RegExp(floor.pattern, 'i');
    } catch (e) {
      throw policyError(`materiality_rules.floors pattern "${floor.pattern}" is not a valid regex: ${e?.message || e}`);
    }
  }
  return floor;
}

function finalizeAllowedSource(entry) {
  const keys = Object.keys(entry);
  if (keys.length !== 1 || (keys[0] !== 'host' && keys[0] !== 'repo')) {
    throw policyError(`sources.allowed entries must be exactly { host } or { repo }, got { ${keys.join(', ')} } — a repo is a path-prefix pattern, not a bare host (§11.3)`);
  }
  if (!entry[keys[0]]) throw policyError(`sources.allowed ${keys[0]} entry is empty`);
  return entry;
}

function finalizeSlaEntry(label, entry) {
  const hours = Number(entry.hours);
  if (!Number.isFinite(hours) || hours <= 0) throw policyError(`review_sla.${label} needs a positive hours, got "${entry.hours ?? ''}"`);
  if (!VALID_SLA_TIMEOUTS.includes(entry.on_timeout)) throw policyError(`review_sla.${label} on_timeout must be one of ${VALID_SLA_TIMEOUTS.join('|')}, got "${entry.on_timeout ?? ''}"`);
  entry.hours = hours;
  return entry;
}

// Parse a .aether/policy.yml string into a Policy entity object.
export function parsePolicyYaml(yamlText, { policy_id = null, source_repo = null } = {}) {
  const lines = String(yamlText || '').split('\n');

  // v2 detection: `version: 2` (or higher) or any v2 top-level key, scanning
  // zero-indent non-comment lines only. A file without any v2 marker takes the
  // v1 path below untouched — that path is regression-critical.
  let isV2 = false;
  for (const raw of lines) {
    if (/^\s/.test(raw)) continue;
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const key = t.split(':')[0].trim();
    if (key === 'version' && parseInt(t.split(':')[1], 10) >= 2) isV2 = true;
    else if (V2_TOP_KEYS.includes(key)) isV2 = true;
    if (isV2) break;
  }

  const policy = {
    policy_id: policy_id || `repo_${source_repo || 'manual'}_v${Date.now()}`,
    version: 1,
    default_action: 'warn',
    rules: [],
    release_gate: { block_on: [], require_review_on: [] },
    source_yaml: yamlText,
    source_type: source_repo ? 'repository' : 'manual',
    source_repo: source_repo || null,
    status: 'draft',
  };

  const setMode = (val) => {
    const v = stripQuotes(val);
    if (!VALID_MODES.includes(v)) throw policyError(`mode must be one of ${VALID_MODES.join('|')}, got "${v}"`);
    if (policy.mode !== undefined && policy.mode !== v) throw policyError(`conflicting mode values ("${policy.mode}" vs "${v}")`);
    policy.mode = v;
  };

  let currentSection = null;
  let currentRule = null;
  let currentFloor = null;   // v2: pending materiality_rules.floors entry
  let currentAllowed = null; // v2: pending sources.allowed entry
  let indentStack = [0];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/\s+$/, '');
    if (!trimmed.trim() || trimmed.trim().startsWith('#')) continue;

    const indent = raw.length - raw.replace(/^\s+/, '').length;
    let content = trimmed.trim();
    // v2 value lines may carry trailing `# comments` (the §11.3 example does).
    // v1 lines are left untouched byte-for-byte.
    if (isV2) content = stripTrailingComment(content);

    // Top-level keys.
    if (indent === 0) {
      // Finalize pending entries before switching sections. (Fixed 2026-08-10,
      // owner-approved: v1 previously dropped a pending rule at this boundary —
      // the last rule before a following top-level key silently vanished, e.g.
      // the wedge default policy's legal_claim rule never applied.)
      if (currentRule) policy.rules.push(currentRule);
      if (currentFloor) policy.materiality_rules.floors.push(finalizeFloor(currentFloor));
      if (currentAllowed) policy.sources.allowed.push(finalizeAllowedSource(currentAllowed));
      currentSection = null;
      currentRule = null;
      currentFloor = null;
      currentAllowed = null;

      if (content.startsWith('version:')) {
        policy.version = parseInt(content.split(':')[1].trim(), 10) || 1;
      } else if (content.startsWith('default_action:')) {
        const val = content.split(':')[1].trim();
        if (VALID_ACTIONS.includes(val)) policy.default_action = val;
      } else if (content.startsWith('policy_id:')) {
        policy.policy_id = content.split(':')[1].trim();
      } else if (content === 'rules:') {
        currentSection = 'rules';
      } else if (content === 'release_gate:') {
        currentSection = 'release_gate';
      } else if (isV2 && content.startsWith('mode:')) {
        setMode(content.slice('mode:'.length));
      } else if (isV2 && content.startsWith('domain_pack:')) {
        policy.domain_pack = stripQuotes(content.slice('domain_pack:'.length));
      } else if (isV2 && content === 'scope:') {
        currentSection = 'scope';
        policy.scope = policy.scope || { include: [], ignore: [] };
      } else if (isV2 && content === 'materiality_rules:') {
        currentSection = 'materiality_rules';
        policy.materiality_rules = policy.materiality_rules || { floors: [] };
      } else if (isV2 && content === 'sources:') {
        currentSection = 'sources';
        policy.sources = policy.sources || { allowed: [] };
      } else if (isV2 && content.startsWith('freshness_days:')) {
        const inline = content.slice('freshness_days:'.length).trim();
        if (inline) policy.freshness_days = positiveNumber(inline, 'freshness_days'); // plain-number back-compat
        else {
          currentSection = 'freshness_days';
          policy.freshness_days = typeof policy.freshness_days === 'object' && policy.freshness_days ? policy.freshness_days : {};
        }
      } else if (isV2 && content === 'review_sla:') {
        currentSection = 'review_sla';
        policy.review_sla = policy.review_sla || {};
      } else if (isV2 && content === 'verdict_reuse:') {
        currentSection = 'verdict_reuse';
        policy.verdict_reuse = policy.verdict_reuse || {};
      } else if (isV2 && content.startsWith('max_claims_per_run:')) {
        policy.max_claims_per_run = positiveInt(content.slice('max_claims_per_run:'.length), 'max_claims_per_run');
      } else if (isV2 && content.startsWith('changed_files_only:')) {
        policy.changed_files_only = parseBool(content.slice('changed_files_only:'.length), 'changed_files_only');
      }
      continue;
    }

    // Nested content.
    if (currentSection === 'rules') {
      // Handle both "- key: val" (inline) and "-" then "key: val" (indented) YAML list styles.
      let kvContent = content;
      if (content.startsWith('- ')) {
        // New rule starts with inline first key.
        if (currentRule) policy.rules.push(currentRule);
        currentRule = { category: '', action: 'warn' };
        kvContent = content.slice(2).trim();
      } else if (content === '-') {
        if (currentRule) policy.rules.push(currentRule);
        currentRule = { category: '', action: 'warn' };
        continue;
      }
      if (currentRule && kvContent.includes(':')) {
        const [key, ...rest] = kvContent.split(':');
        const val = rest.join(':').trim();
        if (key.trim() === 'category') currentRule.category = val;
        else if (key.trim() === 'action' && VALID_ACTIONS.includes(val)) currentRule.action = val;
        else if (key.trim() === 'min_evidence_tier' && VALID_EVIDENCE_TIERS.includes(val)) currentRule.min_evidence_tier = val;
        else if (key.trim() === 'freshness_days') currentRule.freshness_days = parseInt(val, 10);
        else if (key.trim() === 'require_warrant') currentRule.require_warrant = val === 'true';
      }
    } else if (currentSection === 'release_gate') {
      if (content === 'block_on:') {
        currentSection = 'release_gate_block_on';
      } else if (content === 'require_review_on:') {
        currentSection = 'release_gate_review_on';
      } else if (isV2 && content === 'review_on:') {
        // §11.3 spelling — alias for require_review_on.
        currentSection = 'release_gate_review_on';
      } else if (isV2 && content.startsWith('mode:')) {
        setMode(content.slice('mode:'.length));
      } else if (isV2 && content === 'review_sla:') {
        currentSection = 'review_sla';
        policy.review_sla = policy.review_sla || {};
      } else if (isV2 && content === 'degraded_mode:') {
        currentSection = 'release_gate_degraded';
        policy.release_gate.degraded_mode = policy.release_gate.degraded_mode || {};
      } else if (isV2 && content === 'overrides:') {
        currentSection = 'release_gate_overrides';
        policy.release_gate.overrides = policy.release_gate.overrides || {};
      }
    } else if (currentSection === 'release_gate_block_on' || currentSection === 'release_gate_review_on') {
      // A non-list line while a list is open is a sibling key, not a value.
      // (Fixed 2026-08-10, owner-approved: v1 previously swallowed a sibling
      // `require_review_on:` into the open block_on list as a literal value,
      // so its entries — e.g. mixed / supported_with_limits — BLOCKED instead
      // of requiring review.)
      if (!content.startsWith('-')) {
        currentSection = 'release_gate';
        i--; // reprocess this line as release_gate content
        continue;
      }
      const val = content.replace(/^-\s*/, '').trim();
      if (val) {
        if (currentSection === 'release_gate_block_on') policy.release_gate.block_on.push(isV2 ? stripQuotes(val) : val);
        else policy.release_gate.require_review_on.push(isV2 ? stripQuotes(val) : val);
      }
    } else if (currentSection === 'scope') {
      if (content.startsWith('include:')) {
        const inline = content.slice('include:'.length).trim();
        if (inline) policy.scope.include = parseInlineList(inline);
        else currentSection = 'scope_include';
      } else if (content.startsWith('ignore:')) {
        const inline = content.slice('ignore:'.length).trim();
        if (inline) policy.scope.ignore = parseInlineList(inline);
        else currentSection = 'scope_ignore';
      } else if (content.startsWith('changed_files_only:')) {
        policy.changed_files_only = parseBool(content.slice('changed_files_only:'.length), 'scope.changed_files_only');
      } else if (content.startsWith('max_claims_per_run:')) {
        policy.max_claims_per_run = positiveInt(content.slice('max_claims_per_run:'.length), 'scope.max_claims_per_run');
      }
    } else if (currentSection === 'scope_include' || currentSection === 'scope_ignore') {
      if (content.startsWith('-')) {
        const val = stripQuotes(content.replace(/^-\s*/, ''));
        if (val) (currentSection === 'scope_include' ? policy.scope.include : policy.scope.ignore).push(val);
      } else {
        currentSection = 'scope';
        i--; // sibling scope key — reprocess
        continue;
      }
    } else if (currentSection === 'materiality_rules') {
      if (content === 'floors:') currentSection = 'materiality_floors';
    } else if (currentSection === 'materiality_floors') {
      let kvContent = content;
      if (content.startsWith('- ')) {
        if (currentFloor) policy.materiality_rules.floors.push(finalizeFloor(currentFloor));
        currentFloor = {};
        kvContent = content.slice(2).trim();
      } else if (content === '-') {
        if (currentFloor) policy.materiality_rules.floors.push(finalizeFloor(currentFloor));
        currentFloor = {};
        continue;
      }
      if (currentFloor && kvContent.includes(':')) {
        const idx = kvContent.indexOf(':');
        const key = kvContent.slice(0, idx).trim();
        const val = stripQuotes(kvContent.slice(idx + 1));
        if (key === 'match') currentFloor.match = val;
        else if (key === 'pattern') currentFloor.pattern = val;
        else if (key === 'min_materiality') currentFloor.min_materiality = val;
      }
    } else if (currentSection === 'sources') {
      if (content === 'allowed:') {
        currentSection = 'sources_allowed';
      } else if (content.startsWith('freshness_days:')) {
        const inline = content.slice('freshness_days:'.length).trim();
        if (inline) policy.freshness_days = positiveNumber(inline, 'freshness_days');
        else {
          currentSection = 'sources_freshness';
          policy.freshness_days = typeof policy.freshness_days === 'object' && policy.freshness_days ? policy.freshness_days : {};
        }
      }
    } else if (currentSection === 'sources_allowed') {
      if (content.startsWith('-')) {
        if (currentAllowed) policy.sources.allowed.push(finalizeAllowedSource(currentAllowed));
        currentAllowed = {};
        const kv = content.replace(/^-\s*/, '').trim();
        if (kv.includes(':')) {
          const idx = kv.indexOf(':');
          currentAllowed[kv.slice(0, idx).trim()] = stripQuotes(kv.slice(idx + 1));
        }
      } else if (content.includes(':') && !content.endsWith(':')) {
        // Continuation key for a two-line entry.
        if (currentAllowed) {
          const idx = content.indexOf(':');
          currentAllowed[content.slice(0, idx).trim()] = stripQuotes(content.slice(idx + 1));
        }
      } else {
        if (currentAllowed) {
          policy.sources.allowed.push(finalizeAllowedSource(currentAllowed));
          currentAllowed = null;
        }
        currentSection = 'sources';
        i--; // sibling sources key — reprocess
        continue;
      }
    } else if (currentSection === 'freshness_days' || currentSection === 'sources_freshness') {
      if (currentSection === 'sources_freshness' && content.endsWith(':') && !content.startsWith('-')) {
        currentSection = 'sources';
        i--; // sibling sources key — reprocess
        continue;
      }
      const idx = content.indexOf(':');
      if (idx === -1) throw policyError(`freshness_days entries must be "source_class: days", got "${content}"`);
      const cls = stripQuotes(content.slice(0, idx));
      policy.freshness_days[cls] = positiveNumber(content.slice(idx + 1), `freshness_days.${cls}`);
    } else if (currentSection === 'review_sla') {
      const idx = content.indexOf(':');
      if (idx === -1) throw policyError(`review_sla entries must be "label: { hours: N, on_timeout: … }", got "${content}"`);
      const label = stripQuotes(content.slice(0, idx));
      const rest = content.slice(idx + 1).trim();
      if (!rest && RELEASE_GATE_KEYS.includes(label)) {
        currentSection = 'release_gate';
        i--; // sibling release_gate key — reprocess
        continue;
      }
      if (!rest) throw policyError(`review_sla.${label} must be an inline map like { hours: 72, on_timeout: advisory } (block style is not supported)`);
      policy.review_sla[label] = finalizeSlaEntry(label, parseInlineMap(rest, `review_sla.${label}`));
    } else if (currentSection === 'verdict_reuse') {
      const idx = content.indexOf(':');
      if (idx === -1) throw policyError(`verdict_reuse entries must be "key: value", got "${content}"`);
      const key = content.slice(0, idx).trim();
      const val = content.slice(idx + 1);
      if (key === 'enabled' || key === 'respect_freshness') policy.verdict_reuse[key] = parseBool(val, `verdict_reuse.${key}`);
      else policy.verdict_reuse[key] = parseScalar(val);
    } else if (currentSection === 'release_gate_degraded' || currentSection === 'release_gate_overrides') {
      if (content.endsWith(':') && !content.startsWith('-')) {
        currentSection = 'release_gate';
        i--; // sibling release_gate key — reprocess
        continue;
      }
      const idx = content.indexOf(':');
      if (idx !== -1) {
        const target = currentSection === 'release_gate_degraded' ? policy.release_gate.degraded_mode : policy.release_gate.overrides;
        target[content.slice(0, idx).trim()] = parseScalar(content.slice(idx + 1));
      }
    }
  }

  // Push the last rule if pending.
  if (currentRule) policy.rules.push(currentRule);
  if (currentFloor) policy.materiality_rules.floors.push(finalizeFloor(currentFloor));
  if (currentAllowed) policy.sources.allowed.push(finalizeAllowedSource(currentAllowed));

  if (isV2) {
    // §11.3: a v2 policy always carries an explicit posture — absent mode is
    // advisory (never enforcing by accident).
    if (policy.mode === undefined) policy.mode = 'advisory';
    // A file marked v2 by its keys alone is stamped so downstream consumers
    // (and the policy hash) see what the parser saw.
    if (policy.version < 2) policy.version = 2;
  }

  return policy;
}

// Compute the policy hash — SHA-256 of the canonical policy content. Linked
// from warrants so the policy that produced a verdict is reproducible.
export async function computePolicyHash(policy) {
  const canonical = {
    policy_id: policy.policy_id,
    version: policy.version,
    default_action: policy.default_action,
    rules: policy.rules,
    release_gate: policy.release_gate,
  };
  // v2 fields fold in only when present, in a fixed order — v1 hashes are
  // unchanged, and two v2 policies differing only in (say) mode never share
  // a hash.
  if (policy.mode !== undefined) canonical.mode = policy.mode;
  if (policy.domain_pack !== undefined) canonical.domain_pack = policy.domain_pack;
  if (policy.scope !== undefined) canonical.scope = policy.scope;
  if (policy.materiality_rules !== undefined) canonical.materiality_rules = policy.materiality_rules;
  if (policy.sources !== undefined) canonical.sources = policy.sources;
  if (policy.freshness_days !== undefined) canonical.freshness_days = policy.freshness_days;
  if (policy.review_sla !== undefined) canonical.review_sla = policy.review_sla;
  if (policy.verdict_reuse !== undefined) canonical.verdict_reuse = policy.verdict_reuse;
  if (policy.max_claims_per_run !== undefined) canonical.max_claims_per_run = policy.max_claims_per_run;
  if (policy.changed_files_only !== undefined) canonical.changed_files_only = policy.changed_files_only;
  return sha256hex(JSON.stringify(canonical));
}

// Evaluate a claim against a policy — returns the action to take.
// First matching rule wins; falls back to default_action. For v2 policies the
// result also gains `materiality` (§6.2) when it is computable — see
// resolveMateriality below.
export function evaluatePolicy(policy, claim) {
  const result = evaluatePolicyAction(policy, claim);
  if (isV2Policy(policy)) {
    const materiality = resolveMateriality(policy, claim);
    if (materiality) result.materiality = materiality;
  }
  return result;
}

function evaluatePolicyAction(policy, claim) {
  if (!policy || !policy.rules || !policy.rules.length) {
    return { action: policy?.default_action || 'warn', rule: null };
  }
  const category = claim.category || 'general_claim';
  const rule = policy.rules.find((r) => r.category === category);
  if (rule) return { action: rule.action, rule };

  // Check release gate for verdict-based blocking.
  if (claim.verdict_status && policy.release_gate?.block_on?.includes(claim.verdict_status)) {
    return { action: 'block', rule: null, reason: `release_gate blocks on ${claim.verdict_status}` };
  }
  if (claim.verdict_status && policy.release_gate?.require_review_on?.includes(claim.verdict_status)) {
    return { action: 'require_review', rule: null, reason: `release_gate requires review on ${claim.verdict_status}` };
  }

  return { action: policy.default_action || 'warn', rule: null };
}

function isV2Policy(policy) {
  return !!policy && (Number(policy.version) >= 2 || typeof policy.mode === 'string');
}

// Materiality with floors applied (§6.2). The base comes from the claim's own
// risk_level when supplied; floors (match → claim.file_path glob, pattern →
// claim.text regex, case-insensitive) only ever RAISE it. When neither a risk
// signal nor a floor fires, materiality stays absent so callers keep their own
// derivation — a blanket default here could silently LOWER a high-risk claim's
// materiality.
function resolveMateriality(policy, claim) {
  let rank = -1;
  const risk = claim && claim.risk_level;
  if (risk === 'critical' || risk === 'high' || risk === 'low') rank = MATERIALITY_RANK[risk];
  else if (typeof risk === 'string' && risk) rank = MATERIALITY_RANK.normal;

  const floors = policy.materiality_rules && Array.isArray(policy.materiality_rules.floors) ? policy.materiality_rules.floors : [];
  for (const floor of floors) {
    const floorRank = MATERIALITY_RANK[floor.min_materiality];
    if (floorRank === undefined || floorRank <= rank) continue;
    let hit = false;
    if (floor.match && claim && typeof claim.file_path === 'string' && claim.file_path) {
      hit = globToRegExp(floor.match).test(claim.file_path);
    }
    if (!hit && floor.pattern && claim && typeof claim.text === 'string' && claim.text) {
      try {
        hit = new RegExp(floor.pattern, 'i').test(claim.text);
      } catch (e) {
        // Parse-time validation guards the normal path; a hand-built policy
        // with a broken pattern degrades to "floor did not fire".
        console.error('materiality floor pattern failed to compile:', e?.message || e);
      }
    }
    if (hit) rank = floorRank;
  }

  if (rank === -1) return null;
  return VALID_MATERIALITY[rank];
}

// Parse + hash + persist a policy from YAML. Returns the created Policy entity.
export async function persistPolicyFromYaml(svc, yamlText, { policy_id, source_repo, status = 'active' } = {}) {
  const policy = parsePolicyYaml(yamlText, { policy_id, source_repo });
  policy.policy_hash = await computePolicyHash(policy);
  policy.status = status;
  policy.effective_at = new Date().toISOString();
  return await svc.entities.Policy.create(policy);
}
