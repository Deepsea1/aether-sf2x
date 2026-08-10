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
// This is a lightweight YAML subset parser — enough for policy files without
// pulling in a full YAML library. Handles indentation-based nesting, lists,
// and key-value pairs.

const VALID_ACTIONS = ['allow', 'warn', 'require_verification', 'require_human_review', 'block_if_stale', 'block', 'ignore'];
const VALID_EVIDENCE_TIERS = ['primary_authoritative', 'primary_operational', 'qualified_secondary', 'unverified_secondary', 'user_supplied'];

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Parse a .aether/policy.yml string into a Policy entity object.
export function parsePolicyYaml(yamlText, { policy_id = null, source_repo = null } = {}) {
  const lines = String(yamlText || '').split('\n');
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

  let currentSection = null;
  let currentRule = null;
  let indentStack = [0];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/\s+$/, '');
    if (!trimmed.trim() || trimmed.trim().startsWith('#')) continue;

    const indent = raw.length - raw.replace(/^\s+/, '').length;
    const content = trimmed.trim();

    // Top-level keys.
    if (indent === 0) {
      currentSection = null;
      currentRule = null;

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
      }
    } else if (currentSection === 'release_gate_block_on' || currentSection === 'release_gate_review_on') {
      const val = content.replace(/^-\s*/, '').trim();
      if (val) {
        if (currentSection === 'release_gate_block_on') policy.release_gate.block_on.push(val);
        else policy.release_gate.require_review_on.push(val);
      }
    }
  }

  // Push the last rule if pending.
  if (currentRule) policy.rules.push(currentRule);

  return policy;
}

// Compute the policy hash — SHA-256 of the canonical policy content. Linked
// from warrants so the policy that produced a verdict is reproducible.
export async function computePolicyHash(policy) {
  const canonical = JSON.stringify({
    policy_id: policy.policy_id,
    version: policy.version,
    default_action: policy.default_action,
    rules: policy.rules,
    release_gate: policy.release_gate,
  });
  return sha256hex(canonical);
}

// Evaluate a claim against a policy — returns the action to take.
// First matching rule wins; falls back to default_action.
export function evaluatePolicy(policy, claim) {
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

// Parse + hash + persist a policy from YAML. Returns the created Policy entity.
export async function persistPolicyFromYaml(svc, yamlText, { policy_id, source_repo, status = 'active' } = {}) {
  const policy = parsePolicyYaml(yamlText, { policy_id, source_repo });
  policy.policy_hash = await computePolicyHash(policy);
  policy.status = status;
  policy.effective_at = new Date().toISOString();
  return await svc.entities.Policy.create(policy);
}