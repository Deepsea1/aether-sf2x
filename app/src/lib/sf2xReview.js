export const PROBLEM_CATEGORIES = {
  unsupported_claim: 'Unsupported claim',
  contradiction: 'Contradiction',
  missing_provenance: 'Missing provenance',
  outdated_premise: 'Outdated premise',
  overconfidence: 'Overconfidence',
  policy_violation: 'Policy violation',
  source_mismatch: 'Source mismatch',
  weak_calibration: 'Weak calibration',
  human_override_needed: 'Human override needed',
};

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function detectProblems(version, warrant, trust) {
  const m = version?.metrics || {};
  const problems = [];
  if (!warrant || !warrant.id) problems.push({ category: 'missing_provenance', why: 'No decision warrant is attached to this answer.', severity: 'major' });
  if (warrant?.validity_status === 'invalid') problems.push({ category: 'unsupported_claim', why: 'Warrant is invalid — the conclusion lacks support.', severity: 'critical' });
  if (warrant?.validity_status === 'weak') problems.push({ category: 'unsupported_claim', why: 'Warrant is weak — premises are uncertain.', severity: 'moderate' });
  if (warrant?.expiry_date && new Date(warrant.expiry_date) < new Date()) problems.push({ category: 'outdated_premise', why: 'Warrant premises have expired and need revalidation.', severity: 'major' });
  if (clamp(m.expected_calibration_error) > 0.3) problems.push({ category: 'weak_calibration', why: 'Stated confidence diverges sharply from evidence.', severity: 'moderate' });
  if (clamp(m.uncorrected_confidence_rate) > 0.3) problems.push({ category: 'overconfidence', why: 'High-confidence claims left uncorrected.', severity: 'major' });
  if (clamp(m.epistemic_drift_score) > 0.4) problems.push({ category: 'contradiction', why: 'Beliefs drifted across versions — possible contradiction.', severity: 'moderate' });
  if (trust < 60) problems.push({ category: 'human_override_needed', why: `Trust ${trust} is below the promotion threshold.`, severity: trust < 30 ? 'critical' : 'major' });
  return problems;
}

export function suggestedFix(problems) {
  const map = {
    missing_provenance: 'Regenerate with a valid decision warrant.',
    unsupported_claim: 'Re-run with stronger retrieval and restate the premises.',
    outdated_premise: 'Re-validate premises and re-sign the warrant.',
    weak_calibration: 'Re-run and recalibrate confidence against evidence.',
    overconfidence: 'Re-run and reduce stated confidence on weak claims.',
    contradiction: 'Re-run and resolve the contradiction between versions.',
    human_override_needed: 'Escalate for human review or re-run the inquiry.',
    policy_violation: 'Escalate and review policy compliance.',
    source_mismatch: 'Re-run and align sources with cited claims.',
  };
  const top = problems[0];
  return top ? map[top.category] || 'Re-run the inquiry.' : 'No action needed.';
}

export function failureMode(problems) {
  return problems[0]?.category || 'low_trust';
}

const SEV_RANK = { minor: 0, moderate: 1, major: 2, critical: 3 };

export function clusterReviews(rows) {
  const groups = {};
  rows.forEach((r) => {
    const probs = detectProblems(r.version, r.warrant, r.trust);
    const mode = failureMode(probs);
    const domain = r.inquiry?.domain || 'general';
    const key = `${domain}::${mode}`;
    if (!groups[key]) groups[key] = { key, domain, mode, canonical: r.inquiry?.prompt || '—', items: [], topSeverity: 'minor' };
    groups[key].items.push(r);
    const sev = probs[0]?.severity || 'minor';
    if (SEV_RANK[sev] > SEV_RANK[groups[key].topSeverity]) groups[key].topSeverity = sev;
  });
  return Object.values(groups).map((g) => {
    const probs = detectProblems(g.items[0].version, g.items[0].warrant, g.items[0].trust);
    return {
      ...g,
      count: g.items.length,
      rootCause: probs[0]?.why || 'Low trust or governance escalation.',
      sharedFix: suggestedFix(probs),
    };
  });
}

// Split a leading bracketed tag like "[Inbound warrant attestation] eval:…"
// from the real question text so the tag can render as a small label above
// the (now big/white) question in the review queue.
export function splitPromptTag(prompt) {
  const p = String(prompt || '').trim();
  const m = p.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (!m) return { tag: '', question: p };
  return { tag: m[1].trim(), question: m[2].trim() || p };
}

export const CASE_RUBRIC = [
  { label: 'Look for', text: 'Unsupported claims, contradictions, missing/expired provenance, overconfidence, policy violations.' },
  { label: 'Duplicate', text: 'Same query intent + same failure type = one case, not many rows.' },
  { label: 'Fix', text: 'Re-run with stronger retrieval, re-sign the warrant, or merge with a prior case.' },
  { label: 'Done', text: 'Trust restored above threshold and the issue no longer appears elsewhere.' },
];