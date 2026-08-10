export const CAPABILITY_LEVELS = [
  { level: 0, key: 'L0', label: 'Autonomous', text: 'text-emerald-300', dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/10', requiresReview: false, killSwitch: false },
  { level: 1, key: 'L1', label: 'Standard', text: 'text-sky-300', dot: 'bg-sky-400', ring: 'ring-sky-400/30', bg: 'bg-sky-400/10', requiresReview: false, killSwitch: false },
  { level: 2, key: 'L2', label: 'Monitored', text: 'text-amber-300', dot: 'bg-amber-400', ring: 'ring-amber-400/30', bg: 'bg-amber-400/10', requiresReview: false, killSwitch: false },
  { level: 3, key: 'L3', label: 'Human Review', text: 'text-orange-300', dot: 'bg-orange-400', ring: 'ring-orange-400/30', bg: 'bg-orange-400/10', requiresReview: true, killSwitch: false },
  { level: 4, key: 'L4', label: 'Suppressed', text: 'text-rose-300', dot: 'bg-rose-400', ring: 'ring-rose-400/30', bg: 'bg-rose-400/10', requiresReview: true, killSwitch: true },
];

export function assessCapability(stakes, trust, warrant) {
  const validity = warrant?.validity_status || 'valid';
  if (validity === 'invalid' || validity === 'expired' || trust < 30) return CAPABILITY_LEVELS[4];
  if (stakes === 'critical' || trust < 60) return CAPABILITY_LEVELS[3];
  if (stakes === 'high' || trust < 80) return CAPABILITY_LEVELS[2];
  if (stakes === 'medium') return CAPABILITY_LEVELS[1];
  return CAPABILITY_LEVELS[0];
}

function textDelta(a, b) {
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  const aw = new Set(String(a).toLowerCase().split(/\W+/).filter(Boolean));
  const bw = new Set(String(b).toLowerCase().split(/\W+/).filter(Boolean));
  let diff = 0;
  const all = new Set([...aw, ...bw]);
  all.forEach((w) => { if (aw.has(w) !== bw.has(w)) diff++; });
  return all.size ? diff / all.size : 0;
}

// Drift metrics between two answer versions: BDR (Belief Drift Rate), PVVR (Premise Validity Violation Rate), OBAD (Outcome Belief Assignment Drift)
export function computeDrift(prev, curr) {
  if (!prev || !curr) return { bdr: 0, pvvr: 0, obad: 0, composite: 0 };
  const pm = prev.cognitive_state?.working_memory || [];
  const cm = curr.cognitive_state?.working_memory || [];
  const bset = new Set([...pm, ...cm]);
  let bChanged = 0;
  bset.forEach((x) => { if (!pm.includes(x) || !cm.includes(x)) bChanged++; });
  const bdr = bset.size ? bChanged / bset.size : 0;

  const pp = (prev.warrant?.premises || []).map(String);
  const cp = (curr.warrant?.premises || []).map(String);
  const pset = new Set([...pp, ...cp]);
  let pChanged = 0;
  pset.forEach((x) => { if (!pp.includes(x) || !cp.includes(x)) pChanged++; });
  const pvvr = pset.size ? pChanged / pset.size : 0;

  const obad = textDelta(prev.warrant?.conclusion, curr.warrant?.conclusion);
  const composite = Math.min(1, bdr * 0.4 + pvvr * 0.4 + obad * 0.2);
  return { bdr, pvvr, obad, composite };
}

export function correctionSeverity(trustDelta, drift) {
  const loss = Math.max(0, -trustDelta);
  const score = loss * 0.5 + drift * 50;
  if (score >= 40) return 'critical';
  if (score >= 20) return 'major';
  if (score >= 8) return 'moderate';
  return 'minor';
}

export const SEVERITY_STYLES = {
  minor: { text: 'text-emerald-300', bg: 'bg-emerald-400/10', label: 'Minor' },
  moderate: { text: 'text-sky-300', bg: 'bg-sky-400/10', label: 'Moderate' },
  major: { text: 'text-amber-300', bg: 'bg-amber-400/10', label: 'Major' },
  critical: { text: 'text-rose-300', bg: 'bg-rose-400/10', label: 'Critical' },
};

export function driftLabel(composite) {
  if (composite >= 0.66) return { label: 'High drift', text: 'text-rose-300' };
  if (composite >= 0.33) return { label: 'Moderate drift', text: 'text-amber-300' };
  return { label: 'Stable', text: 'text-emerald-300' };
}