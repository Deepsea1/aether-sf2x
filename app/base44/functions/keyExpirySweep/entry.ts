import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';
import { buildLedgerEntry } from '../../shared/ledger.js';
import { sweepOverdueReviews } from '../../shared/reviews.js';

// Daily key-expiry sweep, invoked by the "Key Expiry Guard" workflow.
//  - Keys within 7 days of expiry (not yet warned) → email the owner once.
//  - Keys past expiry & still active (not renewed/rotated) → auto-revoke + admin alert.
//  - Keys renewed to a later date after being warned → clear the warned flag so
//    the next expiry window can warn again.
// Keys with no expiry_date are left alone (never auto-expire).
//
// CONSOLIDATED OPS (the platform's 50-function cap): this function also hosts
// the parked reviewSlaSweep capability. After the key sweep, the review-SLA
// sweep (§12.4) runs too and its result rides along as review_sweep;
// body.op 'review_sla_only' runs just the review sweep (same admin gate). An
// unknown op is a 400 fail-closed; no op at all is the full run below — the
// original key-sweep behavior unchanged, plus the review_sweep block.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function (req) {
  try {
    // The op is peeked off a clone of the request so nothing downstream ever
    // sees a consumed body. Unknown op → 400 before any sweep runs.
    const peeked = (await req.clone().json().catch(() => ({}))) || {};
    if (peeked.op !== undefined && peeked.op !== 'review_sla_only') {
      return Response.json({ error: 'unknown op' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;
    const adminId = _auth.user?.id;

    // Targeted invocation: run ONLY the review-SLA sweep, no key-sweep effects.
    if (peeked.op === 'review_sla_only') {
      return Response.json({ review_sweep: await runReviewSweep(svc, adminId) });
    }

    const now = Date.now();

    const keys = await svc.entities.ApiKey.list('-created_date', 500);
    const users = await svc.entities.User.list('-created_date', 500).catch(() => []);
    const emailFor = (uid) => (users.find((u) => u.id === uid) || {}).email || '';
    const admins = users.filter((u) => u.role === 'admin');

    const warned = [];
    const revoked = [];
    let cleared = 0;

    for (const k of keys) {
      if (!k.active || !k.expiry_date) continue;
      const expMs = new Date(k.expiry_date).getTime();
      if (Number.isNaN(expMs)) continue;
      const msUntil = expMs - now;

      if (msUntil <= 0) {
        // Expired without renewal/rotation → revoke + alert admins.
        await svc.entities.ApiKey.update(k.id, { active: false }).catch(() => {});
        const ownerEmail = emailFor(k.user_id);
        const subject = '🛡️ Aether — API key automatically revoked (expired & not renewed)';
        const body_text =
          `An Aether API key was automatically revoked after expiring without renewal or rotation.\n\n` +
          `Key label: ${k.label || '(none)'}\n` +
          `Key id: ${k.id}\n` +
          `Owner: ${ownerEmail || k.user_id}\n` +
          `Expired: ${k.expiry_date}\n\n` +
          `This key can no longer authenticate API requests. Issue a new key if access is still needed.\n\n` +
          `— Aether automated key-expiry guard`;
        let notifiedAdmins = 0;
        for (const admin of admins) {
          if (!admin.email) continue;
          try {
            await svc.integrations.Core.SendEmail({ to: admin.email, subject, body: body_text });
            notifiedAdmins++;
          } catch (e) {
            console.error('revoke alert email failed for', admin.email, e);
          }
        }
        await svc.entities.AuditLog.create({
          event_type: 'kill_switch', entity_type: 'ApiKey', entity_id: k.id, actor_id: adminId,
          summary: `Auto-revoked expired API key "${k.label || k.id}" (expired ${k.expiry_date}); ${notifiedAdmins} admin(s) alerted`,
          metadata: { key_id: k.id, label: k.label, owner: ownerEmail || k.user_id, expiry_date: k.expiry_date, notified_admins: notifiedAdmins, automated: true },
        }).catch(() => {});
        revoked.push({ id: k.id, label: k.label, owner: ownerEmail || k.user_id, expiry_date: k.expiry_date });
        continue;
      }

      if (msUntil <= SEVEN_DAYS_MS) {
        if (!k.expiry_notified_at) {
          const ownerEmail = emailFor(k.user_id);
          const days = Math.max(1, Math.ceil(msUntil / DAY_MS));
          if (ownerEmail) {
            const subject = `⏳ Aether — your API key expires in ${days} day(s)`;
            const body_text =
              `Your Aether API key is approaching expiry.\n\n` +
              `Key label: ${k.label || '(none)'}\n` +
              `Expires on: ${k.expiry_date}\n` +
              `Days remaining: ${days}\n\n` +
              `Renew or rotate this key before it expires to avoid interruption. On expiry the key is automatically revoked and your account admins receive a security alert.\n\n` +
              `Manage your keys in the Aether Developer Hub.\n\n` +
              `— Aether automated key-expiry guard`;
            try {
              await svc.integrations.Core.SendEmail({ to: ownerEmail, subject, body: body_text });
            } catch (e) {
              console.error('expiry warning email failed for', ownerEmail, e);
            }
          }
          await svc.entities.ApiKey.update(k.id, { expiry_notified_at: new Date().toISOString() }).catch(() => {});
          await svc.entities.AuditLog.create({
            event_type: 'review_opened', entity_type: 'ApiKey', entity_id: k.id, actor_id: adminId,
            summary: `API key "${k.label || k.id}" expiring in <=7 days — owner notified`,
            metadata: { key_id: k.id, label: k.label, owner: ownerEmail || k.user_id, expiry_date: k.expiry_date, days, automated: true },
          }).catch(() => {});
          warned.push({ id: k.id, label: k.label, owner: ownerEmail || k.user_id, expiry_date: k.expiry_date });
        }
      } else if (k.expiry_notified_at) {
        // Was warned for a nearer expiry, but has since been renewed past the
        // 7-day window — clear the flag so the next window can warn again.
        await svc.entities.ApiKey.update(k.id, { expiry_notified_at: null }).catch(() => {});
        cleared++;
      }
    }

    const report = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      warned: warned.length,
      revoked: revoked.length,
      renewed_flags_cleared: cleared,
      warned_keys: warned,
      revoked_keys: revoked,
    };
    await svc.entities.AuditLog.create({
      event_type: 'gate_decision', entity_type: 'ApiKey', entity_id: null, actor_id: adminId,
      summary: `Key expiry sweep: ${warned.length} warned, ${revoked.length} revoked, ${cleared} renewed`,
      metadata: { warned: warned.length, revoked: revoked.length, renewed_flags_cleared: cleared, automated: true },
    }).catch(() => {});
    // The key sweep is done and reported above — the review-SLA sweep rides
    // along after it and can never fail it (runReviewSweep never throws).
    report.review_sweep = await runReviewSweep(svc, adminId);
    return Response.json(report);
  } catch (error) {
    console.error('keyExpirySweep error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}

// review_sla sweep — folded in from functions/reviewSlaSweep (Base44 caps apps
// at 50 backend functions, so the standalone function cannot deploy; this host
// carries it). Gate-review SLA sweep (§12.4): open gate reviews past due_by
// with on_timeout 'advisory' → status 'expired_advisory'; 'remain_blocked'
// (or a missing/unknown on_timeout — fails closed) → stays open, escalated
// once. Idempotent: a re-run repeats no transition. Every transition writes a
// hash-chained ledger entry, plus one summary entry only when any occurred.
// Never throws — the host's key sweep must not fail because the review sweep
// did; a failure comes back as { error } so it is reported, never silent.
async function runReviewSweep(svc, adminId) {
  try {
    const result = await sweepOverdueReviews(svc, {
      actor_id: adminId,
      writeLedger: (params) => createLedgerEntry(svc, params),
    });
    if (result.expired_advisory.length || result.escalated.length) {
      await createLedgerEntry(svc, {
        event_type: 'gate_decision', entity_type: 'Review', entity_id: null, actor_id: adminId,
        summary: `Review SLA sweep: ${result.expired_advisory.length} expired advisory, ${result.escalated.length} escalated (of ${result.overdue} overdue)`,
        metadata: { checked: result.checked, overdue: result.overdue, expired_advisory: result.expired_advisory, escalated: result.escalated, automated: true },
      });
    }
    return {
      checked: result.checked,
      overdue: result.overdue,
      expired_advisory: result.expired_advisory.length,
      escalated: result.escalated.length,
    };
  } catch (error) {
    console.error('review SLA sweep failed', error);
    return { error: error.message };
  }
}

async function createLedgerEntry(svc, params) {
  try {
    const entry = await buildLedgerEntry(svc, params);
    await svc.entities.AuditLog.create(entry);
  } catch (e) {
    console.error('Ledger entry failed:', e?.message || e);
  }
}