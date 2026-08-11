// Service modes (MASTER_PLAN v5 §15.3/§15.4) — the append-only mode ledger.
// The current mode is simply the LATEST ServiceModeEvent row: transitions are
// only ever appended, never updated or deleted, so the chain of rows is itself
// the §15.4 "every transition is an immutable service_mode_event" record.
// The fallback direction is deliberate and FLAGGED: a mode-store read failure
// reports 'normal' WITH mode_read_error:true — callers surface the flag, so
// degradation is never hidden silently (a visible label beats a guess).
// Neither function ever throws to the caller's hot path: getActiveMode falls
// back to the flagged 'normal', setMode returns { error } instead of raising.
//
// Usage:
//   const { mode, mode_read_error } = await getActiveMode(svc);
//   if (DEGRADED_FORCES_ADVISORY.includes(mode)) { /* advisory only */ }
//   await setMode(svc, { mode: 'signing_degraded', reason, actor_id }); // caller enforces admin

// §15.3 TrustServiceMode taxonomy — the only modes a transition may enter.
export const MODES = [
  'normal',
  'degraded_read_only',
  'evidence_retrieval_degraded',
  'model_evaluation_degraded',
  'signing_degraded',
  'revalidation_backlog',
  'cost_limited',
  'security_incident',
  'manual_review_only',
  'emergency_freeze',
];

// Modes in which no automatic enforcing/favorable decision may be issued —
// consumers must downgrade their output to advisory (§15.4: never silently
// downgrade a hard block into a warning; these modes force the honest label).
export const DEGRADED_FORCES_ADVISORY = [
  'model_evaluation_degraded',
  'manual_review_only',
  'security_incident',
  'emergency_freeze',
];

// The active service mode — the latest ServiceModeEvent row. No rows at all is
// an honest 'normal' (the system has never left it). A read failure — or a
// logged mode outside the §15.3 taxonomy, which cannot be interpreted — also
// reports 'normal' but WITH mode_read_error:true, so callers can label the
// degraded read instead of trusting a fallback as fact. Never throws.
export async function getActiveMode(svc) {
  let rows;
  try {
    rows = await svc.entities.ServiceModeEvent.list('-created_date', 1);
  } catch (e) {
    console.error('getActiveMode read failed', e?.message || e);
    return { mode: 'normal', mode_read_error: true };
  }
  const row = rows && rows[0];
  if (!row) return { mode: 'normal' };
  if (!MODES.includes(row.mode)) return { mode: 'normal', mode_read_error: true };
  return { mode: row.mode, since: row.created_date ?? null, reason: row.reason ?? null };
}

// Append a mode transition. Validates mode ∈ MODES, records previous_mode from
// getActiveMode (a flagged read failure records 'normal' — the append itself
// still lands), and returns the created event row. The caller enforces admin;
// auto/indicator are the tripwire extras (auto defaults false; indicator is
// omitted — never null — when absent, the entity's nullable-by-omission rule).
// Never throws: any failure comes back as { error } so a mode transition can
// never take down the hot path that attempted it.
export async function setMode(svc, { mode, reason, actor_id, indicator, auto } = {}) {
  try {
    if (!MODES.includes(mode)) {
      return { error: `invalid mode: ${String(mode)} — must be one of ${MODES.join(', ')}` };
    }
    const current = await getActiveMode(svc);
    const record = {
      mode,
      reason: String(reason ?? '').trim() || '(no reason given)',
      actor_id: String(actor_id ?? '').trim() || 'system',
      previous_mode: current.mode,
      auto: auto === true,
    };
    if (indicator) record.indicator = String(indicator);
    return await svc.entities.ServiceModeEvent.create(record);
  } catch (e) {
    console.error('setMode failed', e?.message || e);
    return { error: e?.message || String(e) };
  }
}
