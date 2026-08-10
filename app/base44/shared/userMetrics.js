// Per-user audit metrics: a fine-grained UserEvent log + a UserMetrics rollup.
// recordUserEvent is best-effort (never throws) so logging never breaks a flow.
// refreshUserMetrics aggregates a user's events + API usage into a UserMetrics row.

const VERDICTS_BAD = new Set(['contested', 'rejected', 'invalid', 'weak', 'suppress', 'suppressed']);

export async function recordUserEvent(svc, evt) {
  try {
    const user_id = String((evt && evt.user_id) || '').trim();
    if (!user_id) return null;
    const VALID = ['inquiry', 'verify', 'attest', 'gate', 'review', 'correction', 'drift', 'other'];
    const event_type = VALID.includes(evt.event_type) ? evt.event_type : 'other';
    return await svc.entities.UserEvent.create({
      user_id,
      event_type,
      trust_score: evt.trust_score == null ? null : Number(evt.trust_score),
      verdict: evt.verdict || null,
      domain: evt.domain || null,
      stakes: evt.stakes || null,
      source: evt.source || null,
      linked_entity_type: evt.linked_entity_type || null,
      linked_entity_id: evt.linked_entity_id || null,
      metadata: evt.metadata || {},
    });
  } catch (e) {
    console.error('recordUserEvent failed', e?.message || e);
    return null;
  }
}

export async function refreshUserMetrics(svc, userId) {
  const user_id = String(userId || '').trim();
  if (!user_id) throw Object.assign(new Error('user_id required'), { status: 400 });

  const events = await svc.entities.UserEvent.filter({ user_id }, '-created_date', 2000).catch(() => []);
  const e = events || [];
  const byType = {};
  let trustSum = 0, trustN = 0, badN = 0, verdictN = 0, lastActive = null;
  const domainCounts = {};
  for (const ev of e) {
    byType[ev.event_type] = (byType[ev.event_type] || 0) + 1;
    if (ev.trust_score != null) { trustSum += Number(ev.trust_score) || 0; trustN++; }
    if (ev.verdict) { verdictN++; if (VERDICTS_BAD.has(ev.verdict)) badN++; }
    if (ev.domain) domainCounts[ev.domain] = (domainCounts[ev.domain] || 0) + 1;
    if (ev.created_date && (!lastActive || ev.created_date > lastActive)) lastActive = ev.created_date;
  }

  const usage = await svc.entities.ApiUsage.filter({ user_id }, '-created_date', 2000).catch(() => []);
  const u = usage || [];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let creditsTotal = 0, creditsThisMonth = 0;
  for (const r of u) {
    creditsTotal += Number(r.credits) || 0;
    if (r.month === month) creditsThisMonth += Number(r.credits) || 0;
  }

  const metrics = {
    user_id,
    total_inquiries: byType.inquiry || 0,
    total_verifications: (byType.verify || 0) + (byType.attest || 0),
    total_gates: byType.gate || 0,
    total_reviews: byType.review || 0,
    mean_trust: trustN ? Math.round(trustSum / trustN) : null,
    contested_rate: verdictN ? Math.round((badN / verdictN) * 100) / 100 : null,
    rejected_count: badN,
    api_credits_used: creditsTotal,
    api_credits_this_month: creditsThisMonth,
    last_active_date: lastActive || (e.length ? e[0].created_date : null),
    domain_counts: domainCounts,
    event_counts: byType,
  };

  const existing = await svc.entities.UserMetrics.filter({ user_id }).catch(() => []);
  if (existing && existing.length) {
    return await svc.entities.UserMetrics.update(existing[0].id, metrics);
  }
  return await svc.entities.UserMetrics.create(metrics);
}