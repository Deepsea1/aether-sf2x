// Review workflow v1 — gate-review creation, resolution, and SLA sweep
// (MASTER_PLAN v5 §12.4–12.5). Gate reviews are Review rows with
// review_type 'gate': one row per qualifying claim (disposition needs_review
// or contradicted at high/critical materiality), opened by the PR wedge via
// createReviewsForGate, resolved by a human through resolveReview, and swept
// past their SLA by reviewSlaSweep. The v1 quorum is one reviewer — a single
// approve/reject decides the review.
//
// Fail-open contract: createReviewsForGate NEVER throws — the wedge must not
// fail because review bookkeeping failed. Timeout semantics fail CLOSED: an
// overdue review with a missing/unknown on_timeout is treated as
// remain_blocked (escalate, stay open) — a timeout never silently releases a
// gate it wasn't explicitly configured to release.
//
// No imports — the entity client (svc) and the ledger writer are injected, so
// every function here is directly harness-testable in node.

// §12.4 SLA defaults by materiality tier. A policy's review_sla map (policy
// v2) overrides per tier; anything invalid falls back here, and the final
// hours fallback is 72.
export const REVIEW_SLA_DEFAULTS = {
  high: { hours: 72, on_timeout: 'advisory' },
  critical: { hours: 72, on_timeout: 'remain_blocked' },
};

const VALID_ON_TIMEOUT = ['advisory', 'remain_blocked'];
const CLAIM_EXCERPT_MAX = 280;

// Resolve the effective SLA for a tier: policy.review_sla?.[tier] overrides
// the defaults field-by-field; invalid values (non-positive hours, unknown
// on_timeout) fall back rather than being trusted.
export function slaForTier(policy, tier) {
  const t = tier === 'critical' ? 'critical' : 'high';
  const defaults = REVIEW_SLA_DEFAULTS[t];
  const override = policy && policy.review_sla && typeof policy.review_sla === 'object' ? policy.review_sla[t] : null;
  const hours = override && Number.isFinite(Number(override.hours)) && Number(override.hours) > 0
    ? Number(override.hours)
    : (defaults.hours ?? 72);
  const on_timeout = override && VALID_ON_TIMEOUT.includes(override.on_timeout)
    ? override.on_timeout
    : defaults.on_timeout;
  return { hours, on_timeout };
}

// A claim qualifies for a gate review when its resolver disposition needs
// human eyes AND its materiality is high or critical (§12.5). Normal/low
// materiality dispositions surface on the claim rows, not the review queue.
export function reviewQualifies(claim) {
  const c = claim || {};
  const needsEyes = c.disposition === 'needs_review' || c.disposition === 'contradicted';
  const material = c.materiality === 'high' || c.materiality === 'critical';
  return needsEyes && material;
}

// Filter to qualifying claims and dedupe within the run — one review per
// claim. Dedupe key is the persisted claim id when present, else the
// normalized claim text (a persist failure must not double-open reviews for
// duplicate claim texts).
export function qualifyingClaims(claims) {
  const list = Array.isArray(claims) ? claims : [];
  const seen = new Set();
  const out = [];
  for (const claim of list) {
    if (!reviewQualifies(claim)) continue;
    const key = claim.id
      ? `id:${claim.id}`
      : `text:${String(claim.text || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

// Create one Review row per qualifying claim for a gate run. NEVER throws —
// any failure (including a single row's create) is logged and the rest
// proceed; the caller always gets an honest { created, review_ids }.
export async function createReviewsForGate(svc, { claims, gate_decision, repo, pr_number, policy, trace_id } = {}) {
  const review_ids = [];
  try {
    const qualifying = qualifyingClaims(claims);
    for (const claim of qualifying) {
      const tier = claim.materiality === 'critical' ? 'critical' : 'high';
      const sla = slaForTier(policy, tier);
      const due_by = new Date(Date.now() + sla.hours * 3600000).toISOString();
      try {
        const row = await svc.entities.Review.create({
          review_type: 'gate',
          status: 'open',
          claim_id: claim.id || null,
          claim_excerpt: String(claim.text || '').slice(0, CLAIM_EXCERPT_MAX),
          repo: repo || null,
          pr_number: pr_number ?? null,
          trace_id: trace_id || null,
          materiality: tier,
          risk_level: claim.risk_level || null,
          disposition: claim.disposition,
          gate_decision: gate_decision || null,
          due_by,
          on_timeout: sla.on_timeout,
          escalated: false,
        });
        review_ids.push(row.id);
      } catch (e) {
        console.error('Gate review create failed:', e?.message || e);
      }
    }
  } catch (e) {
    console.error('createReviewsForGate failed:', e?.message || e);
  }
  return { created: review_ids.length, review_ids };
}

// Resolve a review — the human decision. Returns an outcome object (the
// entry function maps it to an HTTP response):
//   { ok: true, review }                       — resolved
//   { ok: false, status: 400|404|409, error }  — rejected input / not found /
//                                                already decided
// Separation-of-duties floor: decided_by is recorded on the row and in the
// ledger. BLOCKING self-review would need claim/PR authorship data the wedge
// does not have (GitHub commit authorship is not mapped to app users) — that
// is an honest follow-up, not something to fake here.
export async function resolveReviewRow(svc, { review_id, decision, rationale, actor_id, writeLedger } = {}) {
  const id = String(review_id || '').trim();
  if (!id) return { ok: false, status: 400, error: 'review_id is required' };
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, status: 400, error: "decision must be 'approved' or 'rejected'" };
  }
  const reason = String(rationale || '').trim();
  if (!reason) return { ok: false, status: 400, error: 'rationale is required' };

  const review = await svc.entities.Review.get(id).catch(() => null);
  if (!review) return { ok: false, status: 404, error: 'Review not found' };
  // 'open' (gate flow) and 'pending' (answer flow) are the undecided states;
  // anything else is already decided or expired.
  if (review.status !== 'open' && review.status !== 'pending') {
    return { ok: false, status: 409, error: `Review already decided (status: ${review.status})` };
  }

  const now = new Date().toISOString();
  await svc.entities.Review.update(id, {
    status: decision,
    decided_by: actor_id || null,
    decided_at: now,
    rationale: reason,
    reviewer_id: actor_id || null,
    decided_date: now,
  });
  if (typeof writeLedger === 'function') {
    await writeLedger({
      event_type: 'review_resolved',
      entity_type: 'Review',
      entity_id: id,
      actor_id: actor_id || null,
      trace_id: review.trace_id || null,
      summary: `Review ${decision}${review.repo ? ` · ${review.repo}${review.pr_number != null ? `#${review.pr_number}` : ''}` : ''} · ${reason.slice(0, 140)}`,
      metadata: {
        review_id: id,
        review_type: review.review_type || null,
        decision,
        rationale: reason,
        claim_id: review.claim_id || null,
        materiality: review.materiality || null,
        disposition: review.disposition || null,
        repo: review.repo || null,
        pr_number: review.pr_number ?? null,
      },
    });
  }
  return { ok: true, review: { ...review, status: decision, decided_by: actor_id || null, decided_at: now, rationale: reason } };
}

// SLA sweep — find open gate reviews past due_by and apply their timeout
// semantics (§12.4): 'advisory' expires the review to expired_advisory;
// 'remain_blocked' keeps it open and sets escalated once. Missing/unknown
// on_timeout fails closed to remain_blocked. Idempotent by construction:
// expired reviews leave the 'open' set, and escalation is skipped when
// escalated is already true — a re-run repeats no transition. Every
// transition writes a ledger entry; a single row's failure never stops the
// sweep.
export async function sweepOverdueReviews(svc, { now = Date.now(), actor_id, writeLedger } = {}) {
  const open = await svc.entities.Review.filter({ review_type: 'gate', status: 'open' }, '-created_date', 500).catch(() => []);
  const expired_advisory = [];
  const escalated = [];
  let overdue = 0;
  for (const review of open || []) {
    if (!review.due_by) continue;
    const dueMs = new Date(review.due_by).getTime();
    if (Number.isNaN(dueMs) || dueMs > now) continue;
    overdue++;
    const onTimeout = review.on_timeout === 'advisory' ? 'advisory' : 'remain_blocked';
    try {
      if (onTimeout === 'advisory') {
        await svc.entities.Review.update(review.id, { status: 'expired_advisory' });
        if (typeof writeLedger === 'function') {
          await writeLedger({
            event_type: 'review_updated',
            entity_type: 'Review',
            entity_id: review.id,
            actor_id: actor_id || null,
            trace_id: review.trace_id || null,
            summary: `Review SLA expired (advisory) — no decision by ${review.due_by}${review.repo ? ` · ${review.repo}${review.pr_number != null ? `#${review.pr_number}` : ''}` : ''}`,
            metadata: { review_id: review.id, transition: 'expired_advisory', due_by: review.due_by, on_timeout: onTimeout, materiality: review.materiality || null, automated: true },
          });
        }
        expired_advisory.push(review.id);
      } else {
        if (review.escalated) continue; // already escalated — idempotent
        await svc.entities.Review.update(review.id, { escalated: true });
        if (typeof writeLedger === 'function') {
          await writeLedger({
            event_type: 'review_updated',
            entity_type: 'Review',
            entity_id: review.id,
            actor_id: actor_id || null,
            trace_id: review.trace_id || null,
            summary: `Review SLA breached (remain_blocked) — escalated, stays open past ${review.due_by}${review.repo ? ` · ${review.repo}${review.pr_number != null ? `#${review.pr_number}` : ''}` : ''}`,
            metadata: { review_id: review.id, transition: 'escalated', due_by: review.due_by, on_timeout: review.on_timeout || null, materiality: review.materiality || null, automated: true },
          });
        }
        escalated.push(review.id);
      }
    } catch (e) {
      console.error('Review sweep transition failed:', review.id, e?.message || e);
    }
  }
  return { checked: (open || []).length, overdue, expired_advisory, escalated };
}
