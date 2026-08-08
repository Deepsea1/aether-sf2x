export const AUDIT_CATEGORIES = [
  { key: 'request', label: 'Request & Context' },
  { key: 'model', label: 'Model & Prompt' },
  { key: 'retrieval', label: 'Retrieval & Tools' },
  { key: 'output', label: 'Output & Claims' },
  { key: 'governance', label: 'Governance & Policy' },
  { key: 'review', label: 'Human Review' },
  { key: 'provenance', label: 'Provenance & Signatures' },
  { key: 'export', label: 'Export & Distribution' },
];

export function categorize(a) {
  switch (a?.event_type) {
    case 'inquiry_created': return 'request';
    case 'answer_promoted': return 'output';
    case 'correction_logged': return 'output';
    case 'gate_decision': return 'governance';
    case 'review_decision': return 'review';
    case 'kill_switch': return 'governance';
    case 'drift_alert': return 'provenance';
    default: return 'governance';
  }
}

export function buildAuditBundle(audits) {
  return {
    schema: 'sf2x.audit.v1',
    generated_at: new Date().toISOString(),
    count: audits.length,
    events: audits.map((a) => ({
      id: a.id, event_type: a.event_type, category: categorize(a),
      entity_type: a.entity_type, entity_id: a.entity_id, actor_id: a.actor_id,
      summary: a.summary, metadata: a.metadata, created_date: a.created_date,
    })),
  };
}