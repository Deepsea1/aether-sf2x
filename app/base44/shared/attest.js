// Shared attestation pipeline used by warrantApi and batchWarrant.
// Decomposes an answer into atomic claims, independently source-grounds each one
// via live web context, computes a calibrated trust score + verdict, persists the
// full lineage (Inquiry -> AnswerVersion -> signed Warrant), and returns the
// attestation result object (no Response wrapper — callers format responses).

import { calibrateTrust, verdictFromSupport, calibrationFor, empiricalCalibration, verdictFromCalibration } from './calibration.js';
import { generateSignature } from './sf2xCore.js';
import { emitTelemetry, newTraceId } from './telemetry.js';
import { authoritativeFor, classifySource, summarizeGrounding } from './authoritativeSources.js';
import { callLLMJson } from './llmRouter.js';
import { runFalsifier, runCoverageCheck } from './falsifier.js';
import { tribunalCaveat } from './caveat.js';
import { persistClaimsAndEvidence } from './claimPersistence.js';
import { buildWarrantV2Payload, signWarrantV2, sha256Hex } from './canonicalSign.js';
import { clusterSources } from './independence.js';

// Domain-aware warrant expiry: how fast cited sources rot by domain. Medicine
// guidance and clinical evidence decay faster than statutes, so the
// re-validation clock should be shorter for high-stakes, fast-moving fields.
export function warrantExpiryDays(domain) {
  const d = String(domain || 'general').toLowerCase();
  const days = { medicine: 14, finance: 30, legal: 90, science: 60, defense: 60, compliance: 60, technology: 30, general: 30 };
  return days[d] ?? 30;
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SSRF guard: only allow public http(s) URLs. Rejects non-http schemes, localhost,
// private/loopback/link-local/reserved IPv4 + IPv6, and cloud metadata endpoints.
// Critically, it ALSO resolves domain names via DNS and rejects any host whose
// resolved address is private/loopback/link-local/metadata — blocking tricks
// like 127.0.0.1.nip.io or attacker domains pointing at internal services.
function isPrivateIp(ip) {
  const v = String(ip || '').toLowerCase();
  const m4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const o1 = Number(m4[1]), o2 = Number(m4[2]), o3 = Number(m4[3]), o4 = Number(m4[4]);
    if ([o1, o2, o3, o4].some((n) => n > 255)) return true;
    if (o1 === 0 || o1 === 10) return true;
    if (o1 === 127) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    if (o1 >= 224) return true; // multicast / reserved
    return false;
  }
  if (v.includes(':')) {
    if (v === '::' || v === '::1') return true;
    if (/^fe[89ab]/i.test(v) || /^fc/i.test(v) || /^fd/i.test(v)) return true; // link-local / unique-local
    if (/^ff/i.test(v)) return true; // multicast
    const mapped = v.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // IPv4-mapped IPv6
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // unknown format → treat as unsafe
}

// DNS-over-HTTPS resolution against a trusted public resolver (Cloudflare).
// Returns resolved A/AAAA addresses for a domain, or null on failure. Uses
// fetch (sandbox-permitted) so we don't depend on Deno.resolveDns permissions.
async function resolveDnsDoH(host) {
  const ask = async (type, want) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: ctrl.signal,
      });
      const j = await r.json();
      return (j.Answer || []).filter((a) => a.type === want).map((a) => a.data).filter(Boolean);
    } finally { clearTimeout(to); }
  };
  try {
    const [a, aaaa] = await Promise.all([ask('A', 1), ask('AAAA', 28)]);
    return [...a, ...aaaa];
  } catch { return null; }
}

async function assertSafeSourceUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host === 'ip6-localhost' || host.endsWith('.localhost')) return false;
  if (host === 'metadata.google.internal') return false;
  const isIpLiteral = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
  if (isIpLiteral) return !isPrivateIp(host);
  // Domain name: resolve via DNS-over-HTTPS and reject if ANY resolved address
  // is private/loopback/link-local/metadata (SSRF guard — blocks rebinding to
  // 169.254.169.254, 127.0.0.1, 10.x, etc. via nip.io / custom DNS). If
  // resolution fails or yields no records, fail closed: we do not fetch a host
  // we could not validate.
  const addrs = await resolveDnsDoH(host);
  if (!addrs || !addrs.length) return false;
  return addrs.every((a) => !isPrivateIp(a));
}

// Evidence preservation: at attestation time, fetch each cited source and store a
// SHA-256 content hash + metadata so the warrant stays provably grounded even if
// the source later rots or rewrites history. Best-effort, parallel, never throws.
// Manual redirect handling: fetch with redirect: 'manual' and re-validate every
// Location hop against assertSafeSourceUrl, so an attacker can't redirect a
// safe-looking URL to an internal/metadata endpoint (SSRF via redirect bypass).
async function safeFetchValidated(url, { timeoutMs = 10000, maxRedirects = 3 } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'SF2X-EvidencePreservation/1.0' } });
    } finally {
      clearTimeout(to);
    }
    const status = res.status;
    if (status === 301 || status === 302 || status === 307 || status === 308) {
      const loc = res.headers.get('location');
      if (!loc) return { res: null, blocked: false, error: 'redirect without location' };
      let next;
      try { next = new URL(loc, current).toString(); } catch { return { res: null, blocked: false, error: 'invalid redirect location' }; }
      if (!(await assertSafeSourceUrl(next))) return { res: null, blocked: true, error: 'redirect to unsafe url' };
      current = next;
      continue;
    }
    return { res, blocked: false };
  }
  return { res: null, blocked: false, error: 'too many redirects' };
}

export async function snapshotSources(sources, opts = {}) {
  const max = opts.maxSources ?? 6;
  const maxBytes = opts.maxBytes ?? 200000;
  const list = (Array.isArray(sources) ? sources : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, max);
  const results = await Promise.all(list.map(async (url) => {
    const fetched_at = new Date().toISOString();
    if (!(await assertSafeSourceUrl(url))) return { url, fetched_at, status: 'blocked', content_hash: null, content_length: 0 };
    try {
      const r = await safeFetchValidated(url);
      if (r.blocked) return { url, fetched_at, status: 'blocked', content_hash: null, content_length: 0, error: r.error };
      if (!r.res) return { url, fetched_at, status: 'error', content_hash: null, content_length: 0, error: r.error };
      const text = await r.res.text();
      const trimmed = text.slice(0, maxBytes);
      const statusNum = String(r.res.status);
      // hole-6 fix: distinguish paywalled (401/403) and thin (<500B, likely
      // JS-rendered/login walls) snapshots so a warrant never looks "grounded"
      // when its cited sources hashed to little or nothing.
      let status = statusNum;
      let usable = true;
      if (statusNum === '401' || statusNum === '403') { status = 'paywalled'; usable = false; }
      else if (text.length < 500) { status = 'thin'; usable = false; }
      return { url, fetched_at, status, content_hash: usable ? await sha256hex(trimmed) : null, content_length: text.length, content_type: r.res.headers.get('content-type') || '', usable };
    } catch (e) {
      return { url, fetched_at, status: 'error', content_hash: null, content_length: 0, error: String((e && e.message) || e).slice(0, 200) };
    }
  }));
  return results;
}

// Gate 1 — tiered source authority. Replaces the binary
// has_authoritative_sources with a 4-tier weight so a primary document and a
// Substack post are no longer equally non-authoritative.
export const SOURCE_TIERS = {
  T1: { tier: 'T1', weight: 1.0, label: 'Primary' },
  T2: { tier: 'T2', weight: 0.8, label: 'Institutional' },
  T3: { tier: 'T3', weight: 0.5, label: 'Secondary' },
  T4: { tier: 'T4', weight: 0.2, label: 'Self-published' },
};
export function tierForSource(url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } })();
  if (!host) return SOURCE_TIERS.T4;
  if (/(^|\.)gov$|\.gov\./.test(host) || /sec\.gov|gov\.uk|pubmed|ncbi\.|courtlistener|supremecourt|congress\.gov|europa\.eu|nist\.gov|who\.int|un\.org/.test(host)) return SOURCE_TIERS.T1;
  if (/wikipedia\.org|snopes\.com|politifact\.com|factcheck\.org|reuters\.com|apnews\.com|bbc\.(com|co)|nytimes\.com|nature\.com|science\.org|ieee\.org|nasa\.gov/.test(host)) return SOURCE_TIERS.T2;
  if (/substack\.com|medium\.com|reddit\.com|quora\.com|tumblr\.com|wordpress\.com|blogspot\.|disqus/.test(host)) return SOURCE_TIERS.T4;
  return SOURCE_TIERS.T3;
}

function tokenize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}
// Exact substring first; fall back to claim-token presence in the fetched text.
function matchExcerpt(claim, text) {
  const c = String(claim || ''), t = String(text || '');
  if (c.length > 40 && t.toLowerCase().includes(c.toLowerCase().slice(0, 60))) return { excerpt_found: true, match_score: 1 };
  const ct = tokenize(c);
  if (!ct.length) return { excerpt_found: false, match_score: 0 };
  const tset = new Set(tokenize(t));
  const present = ct.filter((w) => tset.has(w)).length;
  const score = present / ct.length;
  return { excerpt_found: score >= 0.5, match_score: Number(score.toFixed(3)) };
}

// Gate 1 fetch/hash/match: for each cited source, fetch it (SSRF-guarded), hash
// it, fuzzy-match the claim against the fetched text, and tier it. Returns
// per-source records (for the warrant) + an aggregate (for the trust calc).
export async function groundSources(sources, claimText, opts = {}) {
  const list = (Array.isArray(sources) ? sources : []).map(String).filter(Boolean).slice(0, opts.maxSources ?? 6);
  const per = await Promise.all(list.map(async (url) => {
    const tier = tierForSource(url);
    if (!(await assertSafeSourceUrl(url))) return { url, fetched: false, tier: tier.tier, content_hash: null, excerpt_found: false, match_score: 0, status: 'blocked' };
    try {
      const r = await safeFetchValidated(url, { timeoutMs: 10000 });
      if (r.blocked) return { url, fetched: false, tier: tier.tier, content_hash: null, excerpt_found: false, match_score: 0, status: 'blocked' };
      if (!r.res) return { url, fetched: false, tier: tier.tier, content_hash: null, excerpt_found: false, match_score: 0, status: 'error' };
      const text = await r.res.text();
      const trimmed = text.slice(0, opts.maxBytes ?? 200000);
      const hash = await sha256hex(trimmed);
      const m = matchExcerpt(claimText, trimmed);
      let status = String(r.res.status);
      if (status === '401' || status === '403') status = 'paywalled';
      else if (text.length < 500) status = 'thin';
      return { url, fetched: true, tier: tier.tier, content_hash: hash, excerpt_found: m.excerpt_found, match_score: m.match_score, status, content_length: text.length };
    } catch (e) {
      return { url, fetched: false, tier: tier.tier, content_hash: null, excerpt_found: false, match_score: 0, status: 'error', error: String((e && e.message) || e).slice(0, 120) };
    }
  }));
  const matched = per.filter((s) => s.excerpt_found);
  const fetched = per.filter((s) => s.fetched);
  const best = matched.sort((a, b) => (SOURCE_TIERS[b.tier].weight - SOURCE_TIERS[a.tier].weight))[0] || null;
  const weighted = matched.reduce((sum, s) => sum + SOURCE_TIERS[s.tier].weight, 0);
  const maxWeight = list.length ? list.reduce((s, u) => s + SOURCE_TIERS[tierForSource(u).tier].weight, 0) : 0;
  return {
    per_source: per,
    n_sources: list.length, n_fetched: fetched.length, n_matched: matched.length,
    grounded: matched.length > 0,
    best_tier: best?.tier || null,
    weighted_grounding_ratio: maxWeight > 0 ? Number((weighted / maxWeight).toFixed(3)) : 0,
  };
}

export const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean' },
          confidence: { type: 'number' },
          note: { type: 'string' },
          authoritative_grounding: { type: 'boolean', description: 'True only when the claim is backed by a domain-authoritative source (PubMed, SEC EDGAR, statute, etc.), not just a generic web page.' },
        },
        required: ['claim', 'supported', 'confidence'],
      },
    },
    overall_validity: { type: 'string', enum: ['valid', 'weak', 'invalid'] },
    confidence: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' } },
    grounding_notes: { type: 'string', description: 'Brief note on whether the answer cited authoritative sources for this domain, or relied on generic web content.' },
  },
  required: ['claims', 'overall_validity', 'confidence'],
};

export function buildVerifyPrompt(answerText, premises, sources, domain) {
  const prem = (premises || []).map((p, i) => `  ${i + 1}. ${p}`).join('\n') || '  (none provided)';
  const src = (sources || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') || '  (none provided)';
  const reg = authoritativeFor(domain);
  const authBlock = reg.domains.length
    ? `\nAUTHORITATIVE SOURCES FOR THIS DOMAIN (${reg.label}):\n${reg.domains.map((d) => `  - ${d}`).join('\n')}\n\n${reg.instruction}\nFor EACH claim, set authoritative_grounding=true ONLY when it is backed by one of these authoritative sources (either cited directly, or the live-web evidence you find originates from one). A claim that agrees with a blog or news rewrite of an authoritative source but does not itself trace to the primary authority is NOT authoritatively grounded. After the claims, add grounding_notes: a one-line assessment of whether the answer relied on authoritative sources or generic web content for this domain.\n`
    : `\nNo domain-specific authoritative source set applies; assess supported/confidence normally and set authoritative_grounding=false for all claims.\n`;
  return `You are the SF2X Warrant Verifier — an independent epistemic auditor. A business has submitted an AI-generated answer for attestation. Your job is to check whether the answer's claims are actually supported by evidence, not to take them at face value.

DOMAIN: ${domain || 'general'}${authBlock}
SUBMITTED ANSWER:
"""${answerText}"""

CLAIMED PREMISES:
${prem}

CLAIMED SOURCES:
${src}

Decompose the answer into its atomic factual claims. For each claim, independently verify it against your web knowledge and the cited sources. Mark supported=true only when the claim is backed by credible evidence; false when unsupported, fabricated, or contradicted. Set confidence 0-1 per claim, and authoritative_grounding per the domain rules above. Then assess overall_validity (valid = claims well supported, weak = mixed, invalid = unsupported/fabricated), an overall confidence 0-1, and list any issues (unsupported claims, missing sources, contradictions, staleness, non-authoritative grounding for a high-stakes domain).

Use live web context where available to catch fabrication. Be strict and impartial. Respond as a single JSON object.`;
}

// Run an independent verification pass on an answer. Returns the normalized
// verification object — used by both initial attestation and re-validation.
export async function runVerification(svc, { answerText, premises, sources, domain, orModel = 'anthropic/claude-3.5-sonnet', b44Model = 'claude_opus_4_8', retrieve = false, falsify = false, foreignVendor = false }) {
  // Route through OpenRouter (OPENROUTER_API_KEY) — 0 Base44 credits, no
  // workspace Google key required. Uses model-internal knowledge (no live web
  // grounding on this path). Falls back to Base44 InvokeLLM if OpenRouter is
  // unfunded so the signature chain stays live. orModel/b44Model let the
  // critical-stakes ensemble run a second cross-firm verifier.
  const v = await callLLMJson(svc, {
    prompt: buildVerifyPrompt(answerText, premises, sources, domain),
    schema: VERIFY_SCHEMA,
    orModel,
    b44Model,
    allowFallback: true, // hole-2 fix: OpenRouter unfunded/payment-required → fall back to Base44 InvokeLLM so the signature chain stays live.
  });
  const claims = Array.isArray(v.claims) ? v.claims : [];
  const total = claims.length || 1;
  const supported = claims.filter((c) => c.supported).length;
  const supportRatio = total ? supported / total : 0;
  const verifierConfidence = Math.max(0, Math.min(1, Number(v.confidence) || 0));
  const rawTrust = supportRatio * 100 * (0.6 + 0.4 * verifierConfidence);
  const grounding = summarizeGrounding(claims, sources, domain);
  // Authoritative-grounding penalty: in high-stakes domains, a claim grounded
  // only in generic web content (no authoritative source cited or found) is
  // less trustworthy than one tracing to PubMed / SEC EDGAR / a statute, even
  // if it happens to be supported. Apply the domain penalty when nothing
  // authoritative backs the answer.
  let trust = calibrateTrust(rawTrust, domain);
  if (grounding.penalty_applied !== undefined) {
    const reg = authoritativeFor(domain);
    if (reg.penalty > 0 && !grounding.has_authoritative_sources && supportRatio > 0) {
      trust = Math.max(0, trust - reg.penalty);
      grounding.penalty_applied = reg.penalty;
    } else {
      grounding.penalty_applied = 0;
    }
  }
  const calib = await empiricalCalibration(svc, domain);
  let validity = verdictFromCalibration(supportRatio, calib);
  let grounded = null;
  if (retrieve && Array.isArray(sources) && sources.length) {
    grounded = await groundSources(sources, answerText).catch(() => null);
    if (grounded) {
      // Gate 1 hard cap: an ungrounded claim cannot score above 50 regardless of
      // model opinion. A fetched+matched T1/T2 source lifts the claim above the
      // old 60 grounding cap — converting "the models agree" into "the document
      // says so".
      // Only cap when we FETCHED a source but it didn't match — a fetch *error*
      // (timeout/abort under load) is inconclusive, not evidence of being
      // ungrounded, so we fall back to the verifier's opinion instead of
      // false-capping a true claim whose source timed out under parallel load.
      if (grounded.n_fetched > 0 && !grounded.grounded) trust = Math.min(trust, 50);
      else if (grounded.best_tier === 'T1') trust = Math.max(trust, 75);
      else if (grounded.best_tier === 'T2') trust = Math.max(trust, 70);
      else if (grounded.best_tier === 'T3') trust = Math.max(trust, 62);
    }
  }
  const issues = Array.isArray(v.issues) ? v.issues : [];
  if (grounding.has_authoritative_sources === false && authoritativeFor(domain).penalty > 0) {
    issues.push(`No domain-authoritative source cited for a ${authoritativeFor(domain).label} claim — grounded only in generic web content.`);
  }
  const groundingNotes = v.grounding_notes || '';

  // ---- Gate 2: the adversary + the honest exit -------------------------------
  // support_confidence = the verifier's confidence the claims are SUPPORTED.
  // detectability_confidence = confidence that, were the claim false, the
  // available sources would have DETECTED it (coverage check). Kept separate so
  // a well-supported absence-of-record claim doesn't read as high trust when the
  // record couldn't have caught a lie.
  const supportConfidence = Number(verifierConfidence) || 0;
  let falsification = null;
  let coverage = null;
  let detectabilityConfidence = 1;
  let crossFirmVerified = false;

  if (falsify) {
    coverage = await runCoverageCheck(svc, { claimText: answerText, sources, grounding: grounded, domain }).catch(() => null);
    if (coverage) detectabilityConfidence = coverage.detectable ? 0.8 : 0.2;
    falsification = await runFalsifier(svc, { claimText: answerText, sources, grounding: grounded, domain, foreignVendor }).catch(() => null);
    if (falsification) crossFirmVerified = !!falsification.cross_firm;
  }

  // insufficient_evidence trigger: >=50% of claims ungrounded after fetching, OR
  // the coverage check says the record could not have detected a falsehood.
  // Only abstain when we actually fetched a source and it didn't match. If every
  // fetch errored/aborted (n_fetched === 0) the grounding is inconclusive — fall
  // back to the verifier's opinion rather than false-abstaining on a true claim
  // whose source timed out. This was the Gate 3 root cause: under 35 parallel
  // foreign-vendor calls, source fetches aborted and true claims misfired
  // insufficient_evidence, collapsing the true-claim catch rate to 2/10.
  const citedButUnmatched = retrieve && Array.isArray(sources) && sources.length > 0 && grounded && grounded.n_fetched > 0 && grounded.n_matched === 0;
  const ungroundedFraction = citedButUnmatched ? 1 : 0;
  if ((ungroundedFraction >= 0.5) || (coverage && coverage.ran && !coverage.detectable)) {
    validity = 'insufficient_evidence';
    issues.push(`Insufficient evidence: ${citedButUnmatched ? 'cited sources did not match the claim text after fetch' : 'coverage check found the record could not have detected a falsehood'}. Abstaining rather than affirming.`);
    if (trust > 45) trust = 45;
  } else if (falsification && falsification.falsification_strength === 'strong') {
    // Falsifier veto. Gate 3: a cross-firm falsifier that strongly disagrees with
    // a home 'valid' verdict surfaces as 'contested' (both arguments attached),
    // not a silent downgrade — disagreement is a legitimate, visible outcome.
    if (falsification.cross_firm && validity === 'valid') {
      validity = 'contested';
      issues.push(`Cross-firm falsifier disagrees with the home tribunal (strong counter-case) — verdict contested. Both arguments attached.`);
    } else {
      validity = validity === 'invalid' ? 'invalid' : 'weak';
      issues.push(`Falsifier produced a strong counter-case (veto): ${String(falsification.argument || '').slice(0, 240)}`);
    }
    if (trust > 50) trust = 50;
  }

  return {
    claims: claims.map((c) => ({ claim: c.claim, supported: !!c.supported, confidence: Number(c.confidence) || 0, note: c.note || '', authoritative_grounding: !!c.authoritative_grounding })),
    total, supported, supportRatio, verifierConfidence, trust, validity, issues, calib,
    grounding, groundingNotes, grounded,
    support_confidence: supportConfidence,
    detectability_confidence: detectabilityConfidence,
    falsification, coverage,
    cross_firm_verified: crossFirmVerified,
  };
}

// Critical-stakes inbound attestation: cross-firm verifier ensemble. Two
// independent labs (OpenAI + Anthropic, falling back to native Base44 models)
// judge the SAME submitted answer; agreement → that verdict, disagreement →
// 'weak' (mixed support), never silently trusting a single model. Mirrors the
// tribunal's critical second-verifier safeguard without changing the inbound
// contract (we attest the submitted answer, not a generated one).
export async function runVerificationEnsemble(svc, args) {
  // Don't run the falsifier twice — run it once after the two verifiers merge.
  const [v1, v2] = await Promise.all([
    runVerification(svc, { ...args, orModel: 'anthropic/claude-3.5-sonnet', b44Model: 'claude_opus_4_8', falsify: false }),
    runVerification(svc, { ...args, orModel: 'openai/gpt-4o', b44Model: 'gpt_5_4', falsify: false }),
  ]);
  const trust = Math.round((v1.trust + v2.trust) / 2);
  const supportRatio = (v1.supportRatio + v2.supportRatio) / 2;
  const verifierConfidence = (v1.verifierConfidence + v2.verifierConfidence) / 2;
  const agreed = v1.validity === v2.validity;
  let validity = agreed ? v1.validity : 'weak';
  const issues = [...new Set([...v1.issues, ...v2.issues])];
  if (!agreed) issues.push(`Cross-firm verifiers disagreed (${v1.validity} vs ${v2.validity}) — downgraded to weak.`);

  // Run the adversary once on the merged result (foreign vendor when requested).
  let falsification = null;
  let coverage = null;
  let detectabilityConfidence = 1;
  let crossFirmVerified = false;
  if (args.falsify) {
    coverage = await runCoverageCheck(svc, { claimText: args.answerText, sources: args.sources, grounding: v1.grounded, domain: args.domain }).catch(() => null);
    if (coverage) detectabilityConfidence = coverage.detectable ? 0.8 : 0.2;
    falsification = await runFalsifier(svc, { claimText: args.answerText, sources: args.sources, grounding: v1.grounded, domain: args.domain, foreignVendor: args.foreignVendor }).catch(() => null);
    if (falsification) crossFirmVerified = !!falsification.cross_firm;
    const citedButUnmatched = Array.isArray(args.sources) && args.sources.length > 0 && v1.grounded && v1.grounded.n_fetched > 0 && v1.grounded.n_matched === 0;
    if ((citedButUnmatched) || (coverage && coverage.ran && !coverage.detectable)) {
      validity = 'insufficient_evidence';
      issues.push(`Insufficient evidence: ${citedButUnmatched ? 'cited sources did not match after fetch' : 'coverage check: record could not have detected a falsehood'}. Abstaining.`);
    } else if (falsification && falsification.falsification_strength === 'strong') {
      if (falsification.cross_firm && validity === 'valid') {
        validity = 'contested';
        issues.push(`Cross-firm falsifier disagrees with the home tribunal (strong counter-case) — verdict contested.`);
      } else {
        validity = validity === 'invalid' ? 'invalid' : 'weak';
        issues.push(`Falsifier produced a strong counter-case (veto): ${String(falsification.argument || '').slice(0, 240)}`);
      }
    }
  }

  return {
    ...v1,
    trust, supportRatio, verifierConfidence, validity, issues,
    support_confidence: Number(verifierConfidence) || 0,
    detectability_confidence: detectabilityConfidence,
    falsification, coverage,
    cross_firm_verified: crossFirmVerified,
    ensemble: { models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'], v1_validity: v1.validity, v2_validity: v2.validity, agreed },
  };
}

export async function attestAnswer(svc, opts) {
  const answerText = String(opts.answerText || '').trim();
  const premises = Array.isArray(opts.premises) ? opts.premises.map(String).filter((p) => p.trim()) : [];
  const sources = Array.isArray(opts.sources) ? opts.sources.map(String).filter((s) => s.trim()) : [];
  const domain = String(opts.domain || 'general').toLowerCase();
  const stakes = ['low', 'medium', 'high', 'critical'].includes(opts.stakes) ? opts.stakes : 'medium';
  const modelLabel = String(opts.modelLabel || 'external');
  const apiKey = opts.apiKey;
  const origin = opts.origin || '';
  const traceId = opts.traceId || newTraceId();

  if (!answerText) throw Object.assign(new Error('answer_text is required'), { status: 400 });
  if (answerText.length > 20000) throw Object.assign(new Error('answer_text too long (max 20000 chars)'), { status: 413 });

  await emitTelemetry(svc, {
    trace_id: traceId, event_type: 'request_received', span_type: 'operation', group: 'identity',
    identity: { role: 'api', plan: apiKey.label || 'api', client_type: 'inbound_api', auth_state: 'x-api-key' },
    summary: `Inbound warrant request · ${modelLabel} · ${domain}`,
  }).catch(() => {});

  // hole-3 fix (latency): if this exact answer text was already attested and
  // carries a non-expired valid warrant, reuse it instead of re-running the
  // ~18s verifier. Repeat / duplicate attestations return instantly.
  try {
    const prior = await svc.entities.AnswerVersion.filter({ answer_text: answerText }, '-created_date', 5);
    if (prior && prior.length) {
      for (const av of prior) {
        if (!av.warrant_id) continue;
        const w = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
        if (!w || w.validity_status !== 'valid') continue;
        if (w.expiry_date && new Date(w.expiry_date).getTime() < Date.now()) continue;
        return {
          verdict: w.validity_status, trust_score: av.trust_score ?? 0, warrant_status: w.validity_status,
          confidence: w.confidence_score ?? 0, lineage_id: av.id, inquiry_id: av.inquiry_id, warrant_id: w.id,
          signed_hash: w.signed_hash, certified: false, certification: 'uncertified',
          cached: true, cache_hit_lineage_id: av.id,
          claims: [], issues: ['Returned from warrant cache — identical answer text was already attested.'], support_ratio: null,
          authoritative_grounding: w.authoritative_grounding, grounding_notes: w.grounding_notes,
          verifier_caveat: `Served from the warrant cache. ${tribunalCaveat({ crossFirmVerified: false })}`,
          verify_url: origin ? `${origin}/verify/${av.id}` : `/verify/${av.id}`,
        };
      }
    }
  } catch { /* cache miss → run full verification */ }

  // hole-3 fix (deeper): fetch source snapshots in parallel with the verifier
  // — they're independent (the verifier uses model-internal knowledge, not the
  // fetched HTML), so the ~6s source fetch moves off the critical path.
  const snapshotsPromise = snapshotSources(sources);
  // Critical-stakes inbound: cross-firm verifier ensemble (mirrors the
  // tribunal's critical second-verifier) — 2 independent labs judge the
  // submitted answer; disagreement downgrades to 'weak' rather than trusting
  // a single model. Lower stakes keep the single-verifier path.
  const ver = opts.stakes === 'critical'
    ? await runVerificationEnsemble(svc, { answerText, premises, sources, domain, falsify: true, foreignVendor: true })
    : await runVerification(svc, { answerText, premises, sources, domain, falsify: true, foreignVendor: false });

  const inquiry = await svc.entities.Inquiry.create({
    prompt: `[Inbound warrant attestation] ${modelLabel} · ${domain}`,
    domain, stakes_level: stakes, status: 'answered', customer_id: apiKey.user_id,
    description: `Attested via warrantApi by API key ${apiKey.id}`,
  });
  const existing = await svc.entities.AnswerVersion.filter({ inquiry_id: inquiry.id });
  const version = existing.length + 1;
  const metrics = {
    confidence_entropy: 1 - ver.verifierConfidence,
    expected_calibration_error: 1 - ver.verifierConfidence,
    uncorrected_confidence_rate: 1 - ver.supportRatio,
    false_refusal_rate: 0, correction_rate: 0, mean_time_to_correction: 0,
    epistemic_drift_score: 1 - ver.supportRatio,
  };
  const av = await svc.entities.AnswerVersion.create({
    inquiry_id: inquiry.id, version, answer_text: answerText,
    cognitive_state: { model: modelLabel, source: 'inbound_api', claim_count: ver.total, supported_claims: ver.supported },
    metrics, trust_score: ver.trust, stakes_level: stakes,
    description: `WarrantApi attestation · ${ver.total} claims`,
  });
  const sourceSnapshots = await snapshotsPromise;
  // hole-6 fix: if sources were cited but every snapshot is thin/paywalled/blocked,
  // the warrant is NOT well-grounded — surface it as an issue rather than hiding it.
  const usableSnaps = sourceSnapshots.filter((s) => s.usable);
  if (sources.length > 0 && sourceSnapshots.length > 0 && usableSnaps.length === 0) {
    ver.issues.push('Cited sources are paywalled, JS-rendered, or too thin to hash meaningfully — grounding is weak.');
  }
  // §5.6 independence analysis — citation count is not corroboration. Cluster
  // the gathered sources by origin (same registrable domain / identical
  // content hash → one origin) so the corroboration summary records how many
  // INDEPENDENT origins back the answer: four syndicated copies are one
  // voice. Additive fields on the grounding summary (persisted on the warrant
  // as authoritative_grounding; nothing existing changes shape); wrapped so
  // independence analysis can never fail an attestation.
  try {
    const indep = clusterSources(sourceSnapshots.map((s) => ({ url: s.url, content_hash: s.content_hash })));
    ver.grounding.independent_origins = indep.independent_origins;
    ver.grounding.clusters_summary = indep.clusters.map((c) => ({ origin: c.origin, size: c.members.length, reason: c.reason }));
    ver.grounding.flags = indep.flags;
  } catch (e) {
    console.error('independence analysis failed:', e?.message || e);
  }
  // Sign with the SAME premises that get persisted, so the registry can
  // reconstruct the signed content. Previously we signed with the raw (possibly
  // empty) input premises but stored the verifier-claim fallback — so no
  // warrant could self-verify when the caller omitted premises.
  const warrantPremises = premises.length ? premises : ver.claims.map((c) => c.claim);
  const signed = await generateSignature([av.id, answerText, warrantPremises.join(';;'), sources.join(';;')].join('|'), opts.signatureKeys || opts.signingKey);
  // Dual-sign (§9.3): additive RFC 8785 canonical v2 signature alongside the
  // legacy delimiter-joined hash. answer_text_sha256 hashes the answer text AS
  // PERSISTED on the AnswerVersion row; conclusion/premises/sources mirror the
  // values persisted below so the payload is recomputable from entities. Never
  // blocks warrant creation — absent keys or a signing failure just means no
  // v2 fields are stored.
  let v2 = null;
  let answerTextSha256 = null;
  try {
    answerTextSha256 = await sha256Hex(answerText);
    v2 = await signWarrantV2(buildWarrantV2Payload({
      answer_version_id: av.id,
      answer_text_sha256: answerTextSha256,
      conclusion: answerText.slice(0, 1000),
      premises: warrantPremises,
      sources,
    }));
  } catch (e) { console.error('warrant v2 signing failed:', e?.message || e); }
  const roles = [
    { role: 'verifier', model_family: 'anthropic', vendor: 'anthropic-via-openrouter' },
    ...(ver.falsification ? [{ role: 'falsifier', model_family: ver.falsification.cross_firm ? 'openai' : 'anthropic', vendor: ver.falsification.vendor }] : []),
    { role: 'coverage', model_family: 'anthropic', vendor: 'anthropic-via-openrouter' },
  ];
  const warrant = await svc.entities.Warrant.create({
    answer_version_id: av.id, premises: warrantPremises,
    conclusion: answerText.slice(0, 1000), confidence_score: ver.verifierConfidence,
    validity_status: ver.validity, sources, claims: ver.claims, issues: ver.issues, authoritative_grounding: ver.grounding, grounding_notes: ver.groundingNotes,
    source_snapshots: sourceSnapshots,
    support_confidence: ver.support_confidence, detectability_confidence: ver.detectability_confidence,
    falsification: ver.falsification, roles,
    expiry_date: new Date(Date.now() + warrantExpiryDays(domain) * 86400000).toISOString(),
    signed_hash: signed, description: `Verified via warrantApi · support ${ver.supported}/${ver.total} · ${ver.validity} · ${ver.grounding.has_authoritative_sources ? 'authoritatively grounded' : 'generic web'} · ${sourceSnapshots.length} sources snapshotted`,
    ...(v2 ? { schema_version: v2.schema_version, payload_hash_v2: v2.payload_hash_v2, signed_hash_v2: v2.signed_hash_v2, key_id_v2: v2.key_id, answer_text_sha256: answerTextSha256 } : {}),
  });
  await svc.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id });

  // Persist discrete Claim + EvidencePack records for claim-level auditability.
  await persistClaimsAndEvidence(svc, {
    ver, warrantId: warrant.id, answerVersionId: av.id,
    tenantId: apiKey.user_id, domain, sources,
  }).catch((e) => console.error('claim persistence failed:', e?.message || e));

  await svc.entities.AuditLog.create({
    event_type: 'answer_promoted', entity_type: 'AnswerVersion', entity_id: av.id, actor_id: apiKey.user_id,
    summary: `Inbound warrant attested · ${ver.validity} · trust ${ver.trust} · ${ver.supported}/${ver.total} claims supported`,
    metadata: { via: 'warrantApi', api_key_id: apiKey.id, model_label: modelLabel, domain, support_ratio: ver.supportRatio },
  }).catch(() => {});

  await emitTelemetry(svc, {
    trace_id: traceId, event_type: 'provenance_signed', span_type: 'provenance', group: 'provenance',
    linked_entity_type: 'AnswerVersion', linked_entity_id: av.id,
    provenance: { warrant_id: warrant.id, signed_hash: signed, validity: ver.validity, trust: ver.trust },
    summary: `Warrant signed · ${ver.validity} · trust ${ver.trust}`,
  }).catch(() => {});

  return {
    verdict: ver.validity, trust_score: ver.trust, warrant_status: ver.validity, confidence: ver.verifierConfidence,
    lineage_id: av.id, inquiry_id: inquiry.id, warrant_id: warrant.id, signed_hash: signed,
    // Inbound single-answer attestation is NOT a tribunal run — it skips the
    // multi-model tribunal and the red-team stress test, so it is uncertified.
    certified: false, certification: 'uncertified',
    cross_firm_verified: ver.cross_firm_verified,
    ...(ver.ensemble ? { ensemble: ver.ensemble } : {}),
    support_confidence: ver.support_confidence, detectability_confidence: ver.detectability_confidence,
    falsification: ver.falsification,
    // A-3 / Gate 2: the canonical 4-role tribunal caveat. Every attestation
    // carries it so API consumers can't mistake a trust score for a ground-truth
    // guarantee or read inter-role agreement as independent confirmation.
    verifier_caveat: tribunalCaveat({ crossFirmVerified: ver.cross_firm_verified }),
    claims: ver.claims, issues: ver.issues, support_ratio: ver.supportRatio,
    authoritative_grounding: ver.grounding, grounding_notes: ver.groundingNotes,
    domain_calibration: { domain: ver.calib.label, valid_threshold: ver.calib.valid_threshold, weak_threshold: ver.calib.weak_threshold, trust_adjust: ver.calib.trust_adjust, source: ver.calib.source },
    verify_url: origin ? `${origin}/verify/${av.id}` : `/verify/${av.id}`,
  };
}

// P3 wedge (Mission A): re-export the SSRF guard + validated fetcher so the
// GitHub PR wedge grounds cited URLs through the SAME machinery as warrant
// evidence preservation. Export-only addition — internals unchanged.
export { assertSafeSourceUrl, safeFetchValidated };