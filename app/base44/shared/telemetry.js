// Shared telemetry emit helper used across backend functions.
// Distills the SF2X telemetry appendix (12 groups) into ONE structured record per event:
// indexed fields (trace_id, span_id, event_type, span_type, group, severity, linked entity)
// plus a `context` object holding whichever telemetry groups are relevant to that event.
// Additive only — emitting never alters existing flow outcomes.

function rid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newTraceId() { return rid('trace'); }
export function newSpanId() { return rid('span'); }

// emitTelemetry(svc, evt) — svc is base44.asServiceRole; evt is a partial event.
// Populated context groups are passed directly on evt (identity, prompt, model, retrieval,
// tool, governance, evaluation, review, provenance, performance, drift, export_pack, summary).
export async function emitTelemetry(svc, evt = {}) {
  try {
    return await svc.entities.Telemetry.create({
      trace_id: evt.trace_id || newTraceId(),
      span_id: evt.span_id || newSpanId(),
      parent_span_id: evt.parent_span_id || null,
      event_type: evt.event_type || 'request_received',
      span_type: evt.span_type || 'operation',
      group: evt.group || null,
      severity: evt.severity || 'info',
      linked_entity_type: evt.linked_entity_type || null,
      linked_entity_id: evt.linked_entity_id || null,
      context: {
        identity: evt.identity || null,
        prompt: evt.prompt || null,
        model: evt.model || null,
        retrieval: evt.retrieval || null,
        tool: evt.tool || null,
        governance: evt.governance || null,
        evaluation: evt.evaluation || null,
        review: evt.review || null,
        provenance: evt.provenance || null,
        performance: evt.performance || null,
        drift: evt.drift || null,
        export_pack: evt.export_pack || null,
        summary: evt.summary || null,
      },
    });
  } catch (e) {
    console.error('emitTelemetry failed', e?.message || e);
    return null;
  }
}