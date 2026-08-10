/**
 * Real-time hallucination alerting — Slack & Microsoft Teams cards.
 *
 * Turns an Aether verification into an actionable alert in a team channel, so a
 * low-trust answer in production starts a conversation instead of sitting in a log.
 *
 * This module is PURE: it normalizes, decides, and formats. It performs no I/O and
 * reads no globals, so every rule and every card is unit-testable. Delivery lives
 * in `dispatchAlert` (below), which is the only function here that touches the
 * network, and it refuses unsafe URLs via the shared SSRF guard.
 *
 * THREE INPUT SHAPES, ONE CANONICAL MODEL. Aether reports a verification in more
 * than one shape depending on where you catch it, and all three are real:
 *   1. `verifyResponse` / batch  → { trust_score, verdict, claims:[{claim,supported,notes}],
 *                                    corrections:[], warrant_id, tribunal_url, lineage_id }
 *   2. the outbound webhook      → { event, data:{ verification_id, trust_score, verdict,
 *                                    flags:[], text_preview, timestamp } }
 *   3. the MCP worker's record   → { verification_id, warrant_id, verdict, trust_score,
 *                                    certified, certification, premises:[], sources:[] }
 * `normalizeVerification` accepts any of them (wrapped in `data` or not) and never
 * invents a field it was not given — absent stays absent, so a card cannot claim a
 * fact the verification did not carry.
 *
 * HONESTY: an alert states only what the verification said. Missing claims are
 * reported as missing rather than rendered as "no problems found", and a score of
 * `null` is never silently coerced to 0 — a score we do not have is not a score of
 * zero, and treating it as zero would fire a false alarm on every incomplete payload.
 */

import { isSafeUrl } from './ssrf.js';

/** Where a relative `tribunal_url` is resolved against. */
export const AETHER_PUBLIC_ORIGIN = 'https://aether.sf2x.com';

/** Highest-risk domains — a fabricated citation here is escalated by default. */
export const HIGH_RISK_DOMAINS = ['legal', 'medicine', 'medical', 'health', 'finance'];

/**
 * DEFAULT_RULES — the trigger policy from the launch audit. Every field is
 * overridable per caller; these are the documented defaults, not magic numbers.
 */
export const DEFAULT_RULES = Object.freeze({
  /** Alert when trust score is strictly below this. */
  minTrustScore: 70,
  /** Alert when the verdict is one of these. */
  verdicts: ['rejected'],
  /** Alert on a fabricated/unverified citation in a high-risk domain. */
  fabricatedCitationInHighRiskDomain: true,
  /** Alert on a fabricated/unverified citation in ANY domain. Off by default. */
  fabricatedCitationAnywhere: false,
});

/** Signals that a citation was fabricated or could not be verified. */
const CITATION_PATTERNS = [
  /fabricat/i,
  /unverified (citation|reference|source)/i,
  /(citation|reference|source)[^.]{0,40}(not|un)(verified|supported|found|cited)/i,
  /no (source|citation|reference)/i,
  /cite the specific/i,
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * normalizeVerification — collapse any supported input shape into one model.
 * Unknown / absent fields stay `null` or empty; nothing is fabricated.
 */
export function normalizeVerification(input) {
  const root = input && typeof input === 'object' ? input : {};
  // The webhook wraps the real payload in `data`; everything else is already flat.
  const body = root.data && typeof root.data === 'object' ? root.data : root;

  const trustScore = isFiniteNumber(body.trust_score) ? body.trust_score : null;

  // `claims` (verifyResponse) and `premises` (worker record) describe the same
  // thing. Keep only entries we can actually read.
  const rawClaims = Array.isArray(body.claims)
    ? body.claims
    : Array.isArray(body.premises)
      ? body.premises
      : [];

  const claims = rawClaims
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      claim: asTrimmedString(c.claim ?? c.premise ?? c.text),
      // Tri-state on purpose: `null` means the payload never said.
      supported: typeof c.supported === 'boolean' ? c.supported : null,
      notes: asTrimmedString(c.notes ?? c.note ?? c.reason),
    }))
    .filter((c) => c.claim || c.notes);

  const corrections = (Array.isArray(body.corrections) ? body.corrections : [])
    .map(asTrimmedString)
    .filter(Boolean);

  const flags = (Array.isArray(body.flags) ? body.flags : []).map(asTrimmedString).filter(Boolean);

  const verificationId =
    asTrimmedString(body.verification_id) || asTrimmedString(body.lineage_id) || null;

  const tribunalPath = asTrimmedString(body.tribunal_url);
  let warrantUrl = null;
  if (tribunalPath) {
    warrantUrl = tribunalPath.startsWith('http')
      ? tribunalPath
      : `${AETHER_PUBLIC_ORIGIN}${tribunalPath.startsWith('/') ? '' : '/'}${tribunalPath}`;
  } else if (verificationId) {
    warrantUrl = `${AETHER_PUBLIC_ORIGIN}/verify/${verificationId}`;
  }

  return {
    verificationId,
    warrantId: asTrimmedString(body.warrant_id) || null,
    verdict: asTrimmedString(body.verdict).toLowerCase() || null,
    trustScore,
    domain: asTrimmedString(body.domain) || null,
    certified: typeof body.certified === 'boolean' ? body.certified : null,
    claims,
    corrections,
    flags,
    textPreview: asTrimmedString(body.text_preview ?? body.answer_text ?? body.text) || null,
    timestamp: asTrimmedString(body.timestamp ?? body.created_at) || null,
    warrantUrl,
  };
}

/** The claims the tribunal could NOT support — the false premises. */
export function unsupportedClaims(verification) {
  return verification.claims.filter((c) => c.supported === false);
}

/** The claims the tribunal did support — the verified facts. */
export function supportedClaims(verification) {
  return verification.claims.filter((c) => c.supported === true);
}

function mentionsFabricatedCitation(verification) {
  const haystack = [
    ...verification.flags,
    ...verification.corrections,
    ...verification.claims.map((c) => c.notes),
  ].filter(Boolean);

  return haystack.some((text) => CITATION_PATTERNS.some((re) => re.test(text)));
}

function isHighRiskDomain(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return HIGH_RISK_DOMAINS.some((risk) => d.includes(risk));
}

/**
 * evaluateAlertRules — decide whether this verification deserves a channel alert.
 *
 * Rules are OR'd: any one match fires. Every match records a human-readable reason,
 * so the alert can say WHY it fired instead of just that it did. A verification with
 * no trust score does not match the score rule — an absent score is not a low score.
 */
export function evaluateAlertRules(verification, rules = {}) {
  const policy = { ...DEFAULT_RULES, ...(rules && typeof rules === 'object' ? rules : {}) };
  const reasons = [];

  if (
    isFiniteNumber(policy.minTrustScore) &&
    verification.trustScore !== null &&
    verification.trustScore < policy.minTrustScore
  ) {
    reasons.push(
      `Trust score ${verification.trustScore} is below the threshold of ${policy.minTrustScore}`,
    );
  }

  const watchedVerdicts = (Array.isArray(policy.verdicts) ? policy.verdicts : [])
    .map((v) => asTrimmedString(v).toLowerCase())
    .filter(Boolean);
  if (verification.verdict && watchedVerdicts.includes(verification.verdict)) {
    reasons.push(`Verdict is "${verification.verdict}"`);
  }

  if (mentionsFabricatedCitation(verification)) {
    const highRisk = isHighRiskDomain(verification.domain);
    if (policy.fabricatedCitationAnywhere) {
      reasons.push('A fabricated or unverifiable citation was reported');
    } else if (policy.fabricatedCitationInHighRiskDomain && highRisk) {
      reasons.push(
        `A fabricated or unverifiable citation was reported in a high-risk domain (${verification.domain})`,
      );
    }
  }

  return { shouldAlert: reasons.length > 0, reasons, policy };
}

// ── Presentation ────────────────────────────────────────────────────────────

/** Severity band for colour + icon. `unknown` when there is no score. */
export function severityOf(verification) {
  const score = verification.trustScore;
  if (score === null) return 'unknown';
  if (score < 50) return 'critical';
  if (score < 70) return 'warning';
  return 'ok';
}

const SEVERITY_STYLE = {
  critical: { icon: '🚨', color: '#d7263d', teams: 'd7263d', label: 'Rejected' },
  warning: { icon: '⚠️', color: '#f4a72c', teams: 'f4a72c', label: 'Contested' },
  ok: { icon: '✅', color: '#2eb872', teams: '2eb872', label: 'Verified' },
  unknown: { icon: '❔', color: '#8a8f98', teams: '8a8f98', label: 'Unknown' },
};

/**
 * trustGauge — a 10-cell bar plus the raw number, e.g. `████░░░░░░ 42/100`.
 * Renders honestly when the score is missing rather than drawing an empty bar
 * that would read as zero.
 */
export function trustGauge(score, cells = 10) {
  if (!isFiniteNumber(score)) return 'no score reported';
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * cells);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, cells - filled))} ${score}/100`;
}

function headline(verification) {
  const style = SEVERITY_STYLE[severityOf(verification)];
  const verdict = verification.verdict ? verification.verdict.toUpperCase() : 'UNKNOWN VERDICT';
  return `${style.icon} Aether flagged an AI response — ${verdict}`;
}

function truncate(text, max) {
  const s = asTrimmedString(text);
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * buildSlackMessage — Slack Block Kit payload for an incoming webhook.
 * `text` is set as the notification fallback so the alert is readable in a push
 * notification and by screen readers, not just in the rendered blocks.
 */
export function buildSlackMessage(verification, options = {}) {
  const { reasons = [] } = options;
  const style = SEVERITY_STYLE[severityOf(verification)];
  const failed = unsupportedClaims(verification);
  const passed = supportedClaims(verification);

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headline(verification), emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Trust score*\n\`${trustGauge(verification.trustScore)}\`` },
        { type: 'mrkdwn', text: `*Domain*\n${verification.domain || 'General'}` },
      ],
    },
  ];

  if (reasons.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why this fired*\n${reasons.map((r) => `• ${r}`).join('\n')}` },
    });
  }

  if (verification.textPreview) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Response*\n>${truncate(verification.textPreview, 300)}` },
    });
  }

  // The false premise vs the verified fact, side by side — the point of the alert.
  if (failed.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${failed.length} unsupported claim(s)*\n` +
          failed
            .slice(0, 3)
            .map((c) => `• ${truncate(c.claim, 160)}${c.notes ? `\n   ↳ _${truncate(c.notes, 200)}_` : ''}`)
            .join('\n'),
      },
    });
  }

  if (passed.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${passed.length} verified claim(s)*\n` +
          passed.slice(0, 2).map((c) => `• ${truncate(c.claim, 160)}`).join('\n'),
      },
    });
  }

  if (verification.claims.length === 0) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '_No per-claim breakdown was included in this payload._' },
      ],
    });
  }

  if (verification.corrections.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Corrections*\n` +
          verification.corrections.slice(0, 3).map((c) => `• ${truncate(c, 200)}`).join('\n'),
      },
    });
  }

  if (verification.warrantUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Cryptographic Warrant', emoji: true },
          url: verification.warrantUrl,
          style: severityOf(verification) === 'critical' ? 'danger' : 'primary',
        },
      ],
    });
  }

  const contextBits = [];
  if (verification.verificationId) contextBits.push(`id \`${verification.verificationId}\``);
  if (verification.certified !== null) {
    contextBits.push(verification.certified ? 'certified' : 'uncertified');
  }
  if (verification.timestamp) contextBits.push(verification.timestamp);
  if (contextBits.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextBits.join(' · ') }] });
  }

  return {
    text: `${headline(verification)} — ${trustGauge(verification.trustScore)}`,
    attachments: [{ color: style.color, blocks }],
  };
}

/**
 * buildTeamsMessage — MessageCard payload for a Microsoft Teams incoming webhook.
 * MessageCard is used rather than an Adaptive Card because incoming webhooks accept
 * it directly with no bot registration, which keeps setup to pasting a URL.
 */
export function buildTeamsMessage(verification, options = {}) {
  const { reasons = [] } = options;
  const style = SEVERITY_STYLE[severityOf(verification)];
  const failed = unsupportedClaims(verification);
  const passed = supportedClaims(verification);

  const facts = [
    { name: 'Trust score', value: trustGauge(verification.trustScore) },
    { name: 'Verdict', value: verification.verdict || 'unknown' },
    { name: 'Domain', value: verification.domain || 'General' },
  ];
  if (reasons.length > 0) facts.push({ name: 'Why this fired', value: reasons.join(' · ') });
  if (failed.length > 0) {
    facts.push({
      name: `Unsupported (${failed.length})`,
      value: failed.slice(0, 3).map((c) => truncate(c.claim || c.notes, 160)).join('  \n'),
    });
  }
  if (passed.length > 0) {
    facts.push({
      name: `Verified (${passed.length})`,
      value: passed.slice(0, 2).map((c) => truncate(c.claim, 160)).join('  \n'),
    });
  }
  if (verification.claims.length === 0) {
    facts.push({ name: 'Claims', value: 'No per-claim breakdown was included in this payload.' });
  }
  if (verification.corrections.length > 0) {
    facts.push({
      name: 'Corrections',
      value: verification.corrections.slice(0, 3).map((c) => truncate(c, 200)).join('  \n'),
    });
  }
  if (verification.verificationId) {
    facts.push({ name: 'Verification id', value: verification.verificationId });
  }

  const card = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor: style.teams,
    summary: headline(verification),
    title: headline(verification),
    sections: [
      {
        activityTitle: `Trust score ${verification.trustScore === null ? 'unreported' : `${verification.trustScore}/100`}`,
        text: verification.textPreview ? truncate(verification.textPreview, 300) : undefined,
        facts,
        markdown: true,
      },
    ],
  };

  if (verification.warrantUrl) {
    card.potentialAction = [
      {
        '@type': 'OpenUri',
        name: 'View Cryptographic Warrant',
        targets: [{ os: 'default', uri: verification.warrantUrl }],
      },
    ];
  }

  return card;
}

/** Channel → payload builder. */
export const CHANNEL_BUILDERS = {
  slack: buildSlackMessage,
  teams: buildTeamsMessage,
};

/**
 * inferChannel — guess the channel from a webhook URL so callers can just paste one.
 * Returns `null` when the host is not recognisable; the caller must then say which.
 */
export function inferChannel(webhookUrl) {
  let host;
  try {
    host = new URL(webhookUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.endsWith('slack.com')) return 'slack';
  if (
    host.endsWith('office.com') ||
    host.endsWith('office365.com') ||
    host.endsWith('microsoft.com') ||
    host.endsWith('webhook.office.com')
  ) {
    return 'teams';
  }
  return null;
}

/**
 * buildAlert — the whole pure decision in one call: normalize, apply the rules, and
 * (only if they fire) format the channel payload. Returns `payload: null` when no
 * alert is warranted, so a caller can log the decision without sending anything.
 */
export function buildAlert(rawVerification, { channel, rules, force = false } = {}) {
  const verification = normalizeVerification(rawVerification);
  const decision = evaluateAlertRules(verification, rules);
  const shouldSend = force || decision.shouldAlert;

  if (!shouldSend) {
    return { verification, ...decision, channel: channel ?? null, payload: null };
  }

  const builder = CHANNEL_BUILDERS[channel];
  if (!builder) {
    throw new Error(
      `unknown alert channel "${channel}" — expected one of: ${Object.keys(CHANNEL_BUILDERS).join(', ')}`,
    );
  }

  return {
    verification,
    ...decision,
    channel,
    payload: builder(verification, { reasons: decision.reasons }),
  };
}

// ── Delivery (the only I/O in this module) ──────────────────────────────────

/**
 * dispatchAlert — POST a built payload to a team webhook.
 *
 * The URL comes from a customer, so it is an SSRF vector: it is checked with the
 * shared `isSafeUrl` guard before any request, which rejects non-http(s) schemes,
 * embedded credentials, and private/link-local/metadata hosts. Redirects are never
 * auto-followed — a 302 from an allowed host could point the POST at an internal
 * target the guard never saw — so each Location is re-validated with `isSafeUrl`
 * and followed manually, capped at 5 hops (the same loop shape as `guardedPost` in
 * app/base44/shared/webhooks.js). Delivery failures are returned, never thrown, so
 * an alerting outage cannot take down the verification path that triggered it.
 */
export async function dispatchAlert(webhookUrl, payload, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!isSafeUrl(webhookUrl)) {
    return { ok: false, status: 0, error: 'webhook_url rejected by SSRF guard' };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    let target = webhookUrl;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetchImpl(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'manual',
        ...(controller ? { signal: controller.signal } : {}),
      });
      const location =
        res.status >= 300 && res.status < 400 && res.headers && typeof res.headers.get === 'function'
          ? res.headers.get('location')
          : null;
      if (location) {
        let next;
        try {
          next = new URL(location, target).href;
        } catch {
          next = null;
        }
        if (!next || !isSafeUrl(next)) {
          return { ok: false, status: 0, error: 'redirect target rejected by SSRF guard' };
        }
        target = next;
        continue;
      }
      return { ok: !!res.ok, status: res.status ?? 0 };
    }
    return { ok: false, status: 0, error: 'too many redirects' };
  } catch (err) {
    return { ok: false, status: 0, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
