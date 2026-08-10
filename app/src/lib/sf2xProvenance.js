import { timeUntilExpiry } from './sf2x';

function fnvHash(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'sha_' + (h >>> 0).toString(16).padStart(8, '0');
}

export function buildProvenanceChain(version, warrant, inquiry, review) {
  const exp = warrant ? timeUntilExpiry(warrant.expiry_date) : { expired: false };
  const wm = version?.cognitive_state?.working_memory || [];
  const sources = warrant?.sources || [];
  return [
    { stage: 'input', label: 'Input / Prompt', hash: inquiry ? fnvHash('inquiry:' + inquiry.id + ':' + inquiry.prompt) : null, status: inquiry ? 'verified' : 'broken' },
    { stage: 'retrieval', label: 'Retrieval / Sources', hash: sources.length ? fnvHash('sources:' + sources.join('|')) : null, status: sources.length ? 'verified' : 'unsigned' },
    { stage: 'model', label: 'Model / Output', hash: version ? fnvHash('answer:' + version.id + ':' + (version.answer_text || '').slice(0, 240)) : null, status: version ? 'verified' : 'broken' },
    { stage: 'claims', label: 'Claim Extraction', hash: wm.length ? fnvHash('wm:' + wm.join('|')) : null, status: wm.length ? 'verified' : 'unsigned' },
    { stage: 'warrant', label: 'Warrant Generation', hash: warrant?.signed_hash || (warrant ? fnvHash('warrant:' + warrant.id) : null), status: warrant ? (exp.expired ? 'expired' : 'verified') : 'broken' },
    { stage: 'review', label: 'Human Review', hash: review ? fnvHash('review:' + review.id) : null, status: review ? (review.status === 'approved' ? 'verified' : review.status === 'killed' ? 'broken' : 'signed') : 'unsigned' },
    { stage: 'export', label: 'Final Export', hash: version ? fnvHash('export:' + version.id) : null, status: version ? 'signed' : 'broken' },
  ];
}

export const SIG_STATE_STYLES = {
  verified: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Verified' },
  signed: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'Signed' },
  unsigned: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Unsigned' },
  broken: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Broken' },
  expired: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Expired' },
};

export function chainStatus(steps) {
  const broken = steps.filter((s) => s.status === 'broken').length;
  const expired = steps.filter((s) => s.status === 'expired').length;
  const unsigned = steps.filter((s) => s.status === 'unsigned').length;
  if (broken) return { key: 'broken', label: 'Chain broken', text: 'text-rose-300' };
  if (expired) return { key: 'expired', label: 'Expired link', text: 'text-rose-300' };
  if (unsigned) return { key: 'partial', label: 'Partially signed', text: 'text-amber-300' };
  return { key: 'verified', label: 'Chain verified', text: 'text-emerald-300' };
}

export function buildProvenanceBundle(version, warrant, inquiry, review, audits) {
  const steps = buildProvenanceChain(version, warrant, inquiry, review);
  return {
    schema: 'sf2x.provenance.v1',
    generated_at: new Date().toISOString(),
    asset_id: version?.id || null,
    parent_id: version?.inquiry_id || null,
    generator: 'SF2X Epistemic Engine',
    inquiry: inquiry ? { id: inquiry.id, prompt: inquiry.prompt, domain: inquiry.domain, stakes_level: inquiry.stakes_level } : null,
    answer_version: version ? { id: version.id, version: version.version, answer_text: version.answer_text, metrics: version.metrics } : null,
    warrant: warrant ? { id: warrant.id, premises: warrant.premises, conclusion: warrant.conclusion, validity_status: warrant.validity_status, sources: warrant.sources, signed_hash: warrant.signed_hash, expiry_date: warrant.expiry_date } : null,
    review: review ? { id: review.id, status: review.status, capability_level: review.capability_level, decided_date: review.decided_date } : null,
    signature_chain: steps.map((s) => ({ stage: s.stage, label: s.label, hash: s.hash, status: s.status })),
    verification: chainStatus(steps),
    audit_events: (audits || []).map((a) => ({ id: a.id, event_type: a.event_type, summary: a.summary, created_date: a.created_date })),
    verification_instructions: 'To verify: recompute each signature_chain hash from the listed artifact, confirm warrant.signed_hash matches the warrant step, and ensure no step is "broken" or "expired". Tamper-evident: any upstream change invalidates downstream hashes.',
  };
}

export function downloadProvenanceBundle(version, warrant, inquiry, review, audits) {
  const bundle = buildProvenanceBundle(version, warrant, inquiry, review, audits);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sf2x_provenance_${version?.id || 'bundle'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}