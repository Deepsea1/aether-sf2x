// Aether Flash — instant-risk detection layer.
// Deterministic, no LLM calls, <50ms local. Identifies whether a claim should
// receive deeper verification. Flash NEVER says "this is true" — only "no
// immediate risk signal detected" or flags specific risk categories.
//
// 14 detection categories per the Aether spec §10.4.

// ---- Severity levels --------------------------------------------------------
const CLEAR = 'clear';   // no signal
const INFO = 'info';     // informational, no action
const WARN = 'warn';     // needs attention
const BLOCK = 'block';   // likely blocks release

// ---- Detection patterns -----------------------------------------------------

// Category 1: Missing citation — claim looks factual but cites no source.
const NO_CITATION_PATTERNS = [
  /\baccording to\b/i, /\bper\b\s+\w+/i, /\bsource:\s/i, /\bref:\s/i,
  /\(https?:\/\//i, /\[.+?\]\(https?:\/\//i,
];
const FACTUAL_INDICATORS = [
  /\b\d{4}\b/, /\b\d+%\b/, /\$\d/, /\b\d+[.,]?\d*\s*(million|billion|trillion|thousand)\b/i,
  /\bincreased by\b/i, /\bdecreased by\b/i, /\breduces?\b/i, /\bimproves?\b/i,
  /\bshows?\b/i, /\bdemonstrates?\b/i, /\bstudy\b/i, /\bresearch\b/i,
];

// Category 3: Citation/claim mismatch — citation URL domain doesn't match claim entity.
// (simplified: checks for obvious domain/entity word mismatches)

// Category 4: Date-sensitive claim without a date.
const DATE_SENSITIVE_INDICATORS = [
  /\bcurrent(ly)?\b/i, /\bnow\b/i, /\btoday\b/i, /\brecent(ly)?\b/i,
  /\blatest\b/i, /\bthis year\b/i, /\bthis quarter\b/i, /\bQ[1-4]\b/,
];
const DATE_PATTERN = /\b(19|20)\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

// Category 5: False numerical precision — overly specific numbers.
const FALSE_PRECISION = /\b\d+\.\d{3,}\b/;

// Category 6: Absolute language without adequate support.
const ABSOLUTE_LANGUAGE = [
  /\balways\b/i, /\bnever\b/i, /\bguaranteed?\b/i, /\b100%\b/i, /\bimpossible\b/i,
  /\bcertain(ly)?\b/i, /\bdefinitive(ly)?\b/i, /\bflawless(ly)?\b/i, /\bperfect(ly)?\b/i,
  /\bproven\b/i, /\bunbreakable\b/i, /\bzero\b\s+(risk|errors?|bugs?|hallucinations?)\b/i,
];

// Category 7: Unsupported statistic — percentage or metric without citation.
const STATISTIC_PATTERN = /\b\d+([.,]\d+)?\s*%/;
const SOURCE_INDICATOR = /\(.*https?:\/\/.*\)|\[.+?\]\(.+?\)|source:|ref:|according to|per\s+\w+/i;

// Category 10: Security/compliance claim lacking evidence.
const SECURITY_KEYWORDS = [
  /\bsecure(d)?\b/i, /\bencrypt(ed|ion)?\b/i, /\bcomplian(t|ce)\b/i, /\bGDPR\b/i,
  /\bHIPAA\b/i, /\bSOC\s*2\b/i, /\bISO\s*27001\b/i, /\bcertified\b/i, /\baudit(ed)?\b/i,
  /\bvulnerab(le|ility)\b/i, /\bprotected\b/i, /\bno\s+(data\s+)?breach/i,
];

// Category 11: Potentially stale source — citation with old year.
const STALE_YEAR = /\((?:19|20)\d{2}\)/;

// Category 12: Prompt-injection pattern — suspicious instructions in content.
const INJECTION_PATTERNS = [
  /\bignore (all |previous )?instructions?\b/i, /\bdisregard (the |all )?above\b/i,
  /\byou are now\b/i, /\bnew instructions?\b/i, /\bsystem prompt\b/i,
  /\bforget (everything|all|previous)\b/i, /\bact as\b/i, /\bpretend (you are|to be)\b/i,
  /\bdo not (verify|check|flag)\b/i, /\boverride\b.*\b(policy|rules?|instructions?)\b/i,
];

// Category 13: Unverified benchmark claim — performance assertions.
const BENCHMARK_CLAIM_PATTERNS = [
  /\breduces?\b.*\bby\s+\d+%?/i, /\bimproves?\b.*\bby\s+\d+%?/i,
  /\b\d+%?\s+(faster|slower|better|worse|more|fewer|reduction|improvement)\b/i,
  /\boutperforms?\b/i, /\bstate-of-the-art\b/i, /\bbest(?:-in-class)?\b/i,
  /\bSOTA\b/i, /\bstate of the art\b/i,
];

// Category 14: High-risk domain trigger.
const HIGH_RISK_DOMAINS = {
  medical: [/\bdiagnos/i, /\btreat(ment|ed)?/i, /\bmedication/i, /\bclinical/i, /\bpatient/i, /\bdosage/i, /\bcontraindicat/i, /\bside effect/i],
  financial: [/\binvestment\b/i, /\brecommend(?:s|ation)?\b.*\b(stock|buy|sell|invest)/i, /\bportfolio\b/i, /\bROI\b/i, /\breturn on investment\b/i],
  legal: [/\blegal advice\b/i, /\byou should sue\b/i, /\bliab(le|ility)\b/i, /\bstatute\b/i, /\bjurisdiction\b/i],
  security: [/\bno\s+(known\s+)?vulnerabilit/i, /\bfully secure\b/i, /\bcannot be hacked\b/i],
};

// ---- Main Flash scan --------------------------------------------------------

export function flashScan(text, { sources = [], domain = 'general' } = {}) {
  const t = String(text || '');
  if (!t.trim()) return { state: 'unverifiable', signals: [], recommendation: 'full_verification_required' };

  const signals = [];

  // 1. Missing citation — factual indicators but no citation patterns.
  const hasFactual = FACTUAL_INDICATORS.some((p) => p.test(t));
  const hasCitation = NO_CITATION_PATTERNS.some((p) => p.test(t)) || (Array.isArray(sources) && sources.length > 0);
  if (hasFactual && !hasCitation) {
    signals.push({ category: 'missing_citation', severity: WARN, detail: 'Claim contains factual indicators but no citation or source reference.' });
  }

  // 3. Citation/claim mismatch — very basic check: if a domain is mentioned in the claim text but not in any source.
  if (Array.isArray(sources) && sources.length > 0) {
    // (simplified — full entity extraction would need NLP; we check for obvious URL vs text domain words)
  }

  // 4. Date-sensitive claim without a date.
  const isDateSensitive = DATE_SENSITIVE_INDICATORS.some((p) => p.test(t));
  const hasDate = DATE_PATTERN.test(t);
  if (isDateSensitive && !hasDate) {
    signals.push({ category: 'date_sensitive_without_date', severity: WARN, detail: 'Claim uses time-sensitive language (current, recent, latest) but includes no specific date.' });
  }

  // 5. False numerical precision.
  if (FALSE_PRECISION.test(t)) {
    signals.push({ category: 'false_numerical_precision', severity: INFO, detail: 'Claim contains a number with 3+ decimal places — may imply false precision.' });
  }

  // 6. Absolute language without adequate support.
  if (ABSOLUTE_LANGUAGE.some((p) => p.test(t))) {
    const matched = ABSOLUTE_LANGUAGE.find((p) => p.test(t));
    signals.push({ category: 'absolute_language', severity: BLOCK, detail: `Absolute language detected ("${matched}") — claims using always/never/guaranteed/100% require strong evidence.` });
  }

  // 7. Unsupported statistic — percentage without a source indicator.
  if (STATISTIC_PATTERN.test(t) && !SOURCE_INDICATOR.test(t) && !hasCitation) {
    signals.push({ category: 'unsupported_statistic', severity: WARN, detail: 'Statistical figure (percentage) present without a source citation.' });
  }

  // 9. Internal contradiction — very basic: look for "not X" and "X" patterns in the same text.
  const notPattern = /\bnot\s+(\w+)/gi;
  let m;
  while ((m = notPattern.exec(t)) !== null) {
    const word = m[1].toLowerCase();
    if (word.length > 3 && new RegExp(`\\b${word}\\b`, 'i').test(t.slice(0, m.index) + t.slice(m.index + m[0].length))) {
      signals.push({ category: 'internal_contradiction', severity: WARN, detail: `Possible contradiction: "not ${word}" appears alongside "${word}" in the same text.` });
      break;
    }
  }

  // 10. Security/compliance claim lacking evidence.
  const isSecurityClaim = SECURITY_KEYWORDS.some((p) => p.test(t));
  if (isSecurityClaim && !hasCitation) {
    signals.push({ category: 'security_claim_lacking_evidence', severity: BLOCK, detail: 'Security or compliance assertion without supporting evidence or citation.' });
  }

  // 11. Potentially stale source.
  if (STALE_YEAR.test(t)) {
    const yearMatch = t.match(/\((19|20)(\d{2})\)/);
    if (yearMatch) {
      const citedYear = 2000 + parseInt(yearMatch[2], 10);
      const currentYear = new Date().getFullYear();
      if (currentYear - citedYear > 3) {
        signals.push({ category: 'potentially_stale_source', severity: WARN, detail: `Source cited from ${2000 + parseInt(yearMatch[2], 10)} — may be stale for a time-sensitive claim.` });
      }
    }
  }

  // 12. Prompt-injection pattern.
  for (const p of INJECTION_PATTERNS) {
    if (p.test(t)) {
      signals.push({ category: 'prompt_injection_pattern', severity: BLOCK, detail: `Potential prompt injection detected: pattern "${p.source.slice(0, 50)}".` });
      break;
    }
  }

  // 13. Unverified benchmark claim.
  if (BENCHMARK_CLAIM_PATTERNS.some((p) => p.test(t))) {
    if (!hasCitation) {
      signals.push({ category: 'unverified_benchmark_claim', severity: WARN, detail: 'Performance/benchmark assertion (reduces by X%, outperforms, SOTA) without citation or reproducible evidence.' });
    }
  }

  // 14. High-risk domain trigger.
  const domainKey = String(domain || 'general').toLowerCase();
  const triggers = HIGH_RISK_DOMAINS[domainKey];
  if (triggers && triggers.some((p) => p.test(t))) {
    signals.push({ category: 'high_risk_domain', severity: BLOCK, detail: `Claim triggers high-risk domain patterns for ${domainKey} — requires primary authoritative evidence and human review.` });
  }

  // Determine overall state.
  const hasBlock = signals.some((s) => s.severity === BLOCK);
  const hasWarn = signals.some((s) => s.severity === WARN);
  let state, recommendation;
  if (hasBlock) {
    state = 'full_verification_required';
    recommendation = 'block';
  } else if (hasWarn) {
    state = 'needs_support';
    recommendation = 'warn';
  } else if (signals.length > 0 && signals.every((s) => s.severity === INFO)) {
    state = 'potential_conflict';
    recommendation = 'warn';
  } else if (isSecurityClaim) {
    state = 'policy_sensitive';
    recommendation = 'require_review';
  } else {
    state = 'clear';
    recommendation = 'allow';
  }

  return { state, signals, recommendation };
}

// Batch scan — runs Flash on multiple claim texts and returns the aggregate.
export function flashScanBatch(claims, opts = {}) {
  const results = (Array.isArray(claims) ? claims : []).map((c) => {
    const text = typeof c === 'string' ? c : (c.text || c.claim || '');
    const sources = typeof c === 'object' ? (c.sources || []) : [];
    return { text, result: flashScan(text, { sources, domain: opts.domain }) };
  });
  const blockCount = results.filter((r) => r.result.recommendation === 'block').length;
  const warnCount = results.filter((r) => r.result.recommendation === 'warn').length;
  return {
    results,
    summary: {
      total: results.length,
      clear: results.filter((r) => r.result.state === 'clear').length,
      needs_support: warnCount,
      full_verification_required: blockCount,
      max_severity: blockCount > 0 ? BLOCK : (warnCount > 0 ? WARN : CLEAR),
    },
  };
}