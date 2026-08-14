import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey } from '../../shared/apiAuth.js';
import { runVerification, snapshotSources } from '../../shared/attest.js';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { createTruthDecision, exposeTruthDecision, modelAssessedDecision } from '../../shared/truthContract.js';

// Re-validate a previously attested answer against the live web. Trust is not
// static: sources rot, facts change. This re-runs the verification pass, measures
// drift from the original attestation, logs a CorrectionEvent when the answer has
// degraded, and downgrades the warrant validity / trust score in place.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const id = String(body.answer_version_id || body.lineage_id || '').trim();
    if (!id) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    let av;
    try { av = await svc.entities.AnswerVersion.get(id); }
    catch { return Response.json({ error: 'Not found' }, { status: 404 }); }

    // Guarded (was an unguarded get before this fix): this fetch now feeds an authorization
    // decision, so it must never be issued with a falsy id, matching gateApi's form.
    let inquiry = null;
    if (av.inquiry_id) { try { inquiry = await svc.entities.Inquiry.get(av.inquiry_id); } catch {} }

    // Cross-tenant ownership gate. `resolveApiKey` only proves the caller holds SOME
    // valid key — the lineage id below is client-supplied and `svc` bypasses RLS, so
    // without this check any key holder could force a re-validation pass that
    // OVERWRITES another tenant's Warrant.validity_status and AnswerVersion.trust_score
    // (the `drifted` branch further down). Unlike the sibling read-only gateApi fix
    // (commit 2c38a88, which gated only its side-effects), a write endpoint has no safe
    // "defer" option, so the whole endpoint fails closed here — before the warrant fetch,
    // before any read of warrant.premises/warrant.sources, and before any mutation.
    // Ownership is checked against BOTH fields because neither alone is sufficient:
    // `created_by_id` is stamped only on session-created records (console UI, MCP
    // run_tribunal), while API-key/service-role paths (warrantApi, batchWarrant, inquire)
    // denormalise the owner onto the parent Inquiry.customer_id instead. See
    // .superpowers/sdd/aether-remaining-build-plan/task-6-report.md for the evidence trail.
    // Fail-closed: a missing/empty owner field never counts as a match, so lineages with
    // neither field set (anonymous verifyResponse/streamVerify) now 404 by design.
    // 404, not 403, and identical in shape to the missing-id branch above — no
    // "exists but isn't yours" enumeration oracle.
    const uid = auth.apiKey.user_id;
    const owns = (!!av.created_by_id && av.created_by_id === uid)
              || (!!inquiry?.customer_id && inquiry.customer_id === uid);
    if (!uid || !owns) return Response.json({ error: 'Not found' }, { status: 404 });

    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
    if (!warrant) return Response.json({ error: 'No warrant attached to this answer' }, { status: 404 });

    // Linkage gate — closes the gap the Task 8 reviewer found in commit 5553c14. The
    // ownership check above proves the caller owns `av`; it does NOT prove `warrant` is
    // the warrant that belongs to `av`. `AnswerVersion.warrant_id` is a plain string field
    // a signed-in user can set on their OWN AnswerVersion via the normal client SDK
    // (base44.entities.AnswerVersion.update, as used in app/src/pages/Home.jsx and
    // app/src/lib/sf2xRevise.js) — RLS permits it because the row is theirs. Warrant ids
    // are not secret (warrantRegistry, the unauthenticated verifyAnswer endpoint and the
    // public /verify/:id page all surface them), so without this check an attacker points
    // their own AnswerVersion's warrant_id at another tenant's Warrant, passes the
    // ownership gate legitimately, and this endpoint overwrites that Warrant's
    // validity_status on the drift path below.
    // The authoritative direction is Warrant.answer_version_id: it is schema-required
    // (app/base44/entities/Warrant.jsonc) and explicitly set to the owning av's id at
    // every Warrant.create call site in the repo (shared/attest.js and the inquire,
    // inquireTribunal x3, verifyResponse, streamVerify, prepareReview,
    // debateAndValidateCorrection functions, plus the two client paths), each of which
    // then writes warrant_id back onto that same AnswerVersion — so the two-way link
    // always agrees for legitimately created records.
    // Fails closed by construction: a warrant with a missing or empty answer_version_id
    // is denied by the plain `!==` (undefined !== av.id and '' !== av.id are both true),
    // so no truthiness pre-guard is needed. Placed before any read of warrant.premises /
    // warrant.sources and before every mutation. 404 in the same shape as the ownership
    // gate above. Note it IS distinguishable from the preceding "No warrant attached"
    // branch, so it confirms a probed Warrant id exists without being linked to the
    // caller — that is not a leak here, since Warrant existence is already public via
    // warrantRegistry, verifyAnswer and /verify/:id.
    if (warrant.answer_version_id !== av.id) return Response.json({ error: 'Not found' }, { status: 404 });

    const originalTrust = av.trust_score != null ? av.trust_score : computeTrustworthyRate(av.metrics || {}, warrant);
    const originalValidity = warrant.validity_status;

    const ver = await runVerification(svc, {
      answerText: av.answer_text,
      premises: warrant.premises,
      sources: warrant.sources,
      domain: (inquiry && inquiry.domain) || 'general',
    });

    const now = Date.now();
    const expired = warrant.expiry_date && new Date(warrant.expiry_date).getTime() < now;
    let newValidity = ver.validity;
    if (expired) newValidity = 'expired';

    // hole-7 fix: source-rot detection. The warrant stored SHA-256 content
    // hashes of every cited source at attestation time. Re-fetch now and
    // compare — catches silent source rewrites the claim-verifier can miss.
    let sourceRot = { changed: 0, total: 0, sources: [] };
    try {
      const priorSnaps = Array.isArray(warrant.source_snapshots) ? warrant.source_snapshots : [];
      if (priorSnaps.length && Array.isArray(warrant.sources) && warrant.sources.length) {
        const fresh = await snapshotSources(warrant.sources);
        sourceRot.total = fresh.length;
        sourceRot.sources = fresh.map((f) => {
          const prev = priorSnaps.find((p) => p.url === f.url);
          const changed = !!(prev && prev.content_hash && f.content_hash && prev.content_hash !== f.content_hash);
          if (changed) sourceRot.changed++;
          return { url: f.url, changed, status: f.status };
        });
      }
    } catch { /* best-effort */ }

    const trustDelta = ver.trust - originalTrust;
    const downgraded = ['valid', 'weak', 'expired'].indexOf(newValidity) > ['valid', 'weak', 'expired'].indexOf(originalValidity)
      || (originalValidity === 'valid' && newValidity !== 'valid');
    const driftScore = Math.min(1, Math.abs(trustDelta) / 100 + (downgraded ? 0.3 : 0) + (expired ? 0.2 : 0) + (sourceRot.changed > 0 ? 0.25 : 0));
    const drifted = driftScore >= 0.1 || downgraded || expired || sourceRot.changed > 0;
    const storedDecision = av.cognitive_state?.truth_decision || modelAssessedDecision({
      policyId: 'revalidate-warrant-model-assessment',
      policyVersion: '1',
      missingEvidence: ['The original answer version has no independently evaluated factual decision.'],
    });
    const truthDecision = createTruthDecision({
      ...storedDecision,
      integrity_status: sourceRot.changed > 0 ? 'UNAVAILABLE' : storedDecision.integrity_status,
      action_authorization: (sourceRot.changed > 0 || expired) ? 'NOT_AUTHORIZED' : storedDecision.action_authorization,
      policy_id: 'revalidate-warrant-integrity',
      policy_version: '1',
      satisfied_rules: sourceRot.changed > 0 ? [] : ['revalidation_completed'],
      failed_rules: [
        ...(sourceRot.changed > 0 ? ['source_content_changed_since_attestation'] : []),
        ...(expired ? ['warrant_expired'] : []),
      ],
    });

    let severity = 'minor';
    if (driftScore >= 0.5 || newValidity === 'invalid') severity = 'critical';
    else if (driftScore >= 0.3) severity = 'major';
    else if (driftScore >= 0.15) severity = 'moderate';

    if (drifted) {
      await svc.entities.CorrectionEvent.create({
        inquiry_id: av.inquiry_id,
        from_version_id: av.id,
        to_version_id: av.id,
        from_version: av.version,
        to_version: av.version,
        severity,
        detected_by: 'drift_detector',
        trust_delta: trustDelta,
        drift_score: driftScore,
        notes: `Re-validation: ${ver.supported}/${ver.total} claims now supported (was ${(originalTrust / 100 * (ver.total || 1)).toFixed(0)}/${ver.total}). ${expired ? 'Warrant expired. ' : ''}${ver.issues.slice(0, 3).join('; ')}`,
      }).catch(() => {});

      await svc.entities.Warrant.update(warrant.id, { validity_status: newValidity }).catch(() => {});
      await svc.entities.AnswerVersion.update(av.id, {
        trust_score: ver.trust,
        cognitive_state: { ...(av.cognitive_state || {}), truth_decision: truthDecision },
      }).catch(() => {});

      await svc.entities.AuditLog.create({
        event_type: 'drift_alert',
        entity_type: 'AnswerVersion',
        entity_id: av.id,
        actor_id: auth.apiKey.user_id,
        summary: `Drift detected · ${originalValidity}→${newValidity} · trust ${originalTrust}→${ver.trust} · drift ${driftScore.toFixed(2)}`,
        metadata: { via: 'revalidateWarrant', original_trust: originalTrust, new_trust: ver.trust, drift_score: driftScore, severity },
      }).catch(() => {});

      await emitTelemetry(svc, {
        trace_id: newTraceId(), event_type: 'drift_detected', span_type: 'operation', group: 'drift', severity: 'warn',
        linked_entity_type: 'AnswerVersion', linked_entity_id: av.id,
        drift: { original_trust: originalTrust, new_trust: ver.trust, drift_score: driftScore, validity_before: originalValidity, validity_after: newValidity },
        summary: `Drift detected · ${originalValidity}→${newValidity}`,
      }).catch(() => {});
    }

    return Response.json({
      answer_version_id: av.id,
      warrant_id: warrant.id,
      revalidated: true,
      drifted,
      expired,
      original_trust: originalTrust,
      new_trust: ver.trust,
      trust_delta: trustDelta,
      drift_score: Number(driftScore.toFixed(3)),
      validity_before: originalValidity,
      validity_after: newValidity,
      severity,
      source_rot_detected: sourceRot.changed > 0,
      source_rot: sourceRot,
      claims: ver.claims,
      issues: ver.issues,
      support_ratio: ver.supportRatio,
      ...exposeTruthDecision(truthDecision),
    });
  } catch (error) {
    console.error('revalidateWarrant error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
