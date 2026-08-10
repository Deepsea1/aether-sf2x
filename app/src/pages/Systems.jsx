import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, ShieldAlert, Eye, Loader2, Info, CheckCircle2, GitBranch, ShieldCheck, Activity, FlaskConical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import { computeTrustworthyRate, timeUntilExpiry } from '@/lib/sf2x';

const RISK_STYLES = {
  low: 'text-emerald-300 bg-emerald-400/10',
  medium: 'text-amber-300 bg-amber-400/10',
  high: 'text-orange-300 bg-orange-400/10',
  regulated: 'text-rose-300 bg-rose-400/10',
};
const LIFECYCLE = ['draft', 'evaluated', 'approved', 'monitored', 'degraded', 'suspended', 'retired'];
const LIFECYCLE_HINT = {
  draft: 'Just registered — not yet evaluated.',
  evaluated: 'Tested, but release gates not all signed off.',
  approved: 'Gates complete — cleared to go live.',
  monitored: 'Live and watched for drift.',
  degraded: 'Signals off — investigate.',
  suspended: 'Paused by governance.',
  retired: 'Decommissioned.',
};
const GATES = ['named_owner', 'documented_purpose', 'evaluation_summary', 'review_completion', 'risk_signoff', 'rollback_criteria'];
const GATE_HINT = {
  named_owner: 'A named person is accountable for this system.',
  documented_purpose: 'The use case is written down and bounded.',
  evaluation_summary: 'Eval results are recorded.',
  review_completion: 'Required reviews are complete.',
  risk_signoff: 'Risk team signed off on the release.',
  rollback_criteria: 'A rollback / kill-switch plan exists.',
};
const ALERT_SEV = { critical: 'text-rose-300 bg-rose-400/10', major: 'text-orange-300 bg-orange-400/10', moderate: 'text-amber-300 bg-amber-400/10' };
const REC_STYLES = { rose: 'bg-rose-400/15 text-rose-300 border-rose-400/30', amber: 'bg-amber-400/15 text-amber-300 border-amber-400/30', emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' };
const ALERT_REC = { critical: 'Escalate now', major: 'Escalate if recurring', moderate: 'Review, then escalate or silence' };
const ALERT_DESC = {
  hallucination_spike: 'Answers with high uncorrected-confidence — likely confident-but-wrong outputs.',
  contradiction_spike: 'New answers contradict earlier corrections (high drift score).',
  duplicate_cluster: 'The same inquiry is failing repeatedly — a systemic, not one-off, failure.',
  provenance_break: 'Answers with a missing or invalid warrant — no verifiable backing.',
  trust_collapse: 'Trust score dropped below 30 — the answer is effectively untrusted.',
  policy_violation: 'Reviews killed by policy — a governance gate fired.',
  expired_evidence: 'Source evidence is past its revalidation date — it may be stale.',
};

function computeAlerts(versions, warrants, reviews, corrections) {
  const wMap = new Map(warrants.map((w) => [w.id, w]));
  const trustOf = (v) => computeTrustworthyRate(v.metrics, wMap.get(v.warrant_id));
  const pair = (v) => ({ answer_version_id: v.id, inquiry_id: v.inquiry_id });
  const rpair = (r) => ({ answer_version_id: r.answer_version_id, inquiry_id: r.inquiry_id });

  const hallucV = versions.filter((v) => (Number(v.metrics?.uncorrected_confidence_rate) || 0) > 0.3);
  const collapsedV = versions.filter((v) => trustOf(v) < 30);
  const brokenV = versions.filter((v) => !v.warrant_id || wMap.get(v.warrant_id)?.validity_status === 'invalid');
  const expiredV = versions.filter((v) => v.warrant_id && wMap.get(v.warrant_id) && timeUntilExpiry(wMap.get(v.warrant_id).expiry_date).expired);
  const contradC = corrections.filter((c) => (Number(c.drift_score) || 0) > 0.5);
  const contradIds = new Set(contradC.map((c) => c.to_version_id));
  const contradV = versions.filter((v) => contradIds.has(v.id));
  const killedR = reviews.filter((r) => r.status === 'killed');
  const byInq = {};
  reviews.forEach((r) => { byInq[r.inquiry_id] = (byInq[r.inquiry_id] || 0) + 1; });
  const dupInq = new Set(Object.entries(byInq).filter(([, n]) => n > 1).map(([id]) => id));
  const dupR = reviews.filter((r) => dupInq.has(r.inquiry_id));

  return [
    { key: 'hallucination_spike', label: 'Hallucination spike', count: hallucV.length, sev: 'major', offending: hallucV.map(pair) },
    { key: 'contradiction_spike', label: 'Contradiction spike', count: contradV.length, sev: 'major', offending: contradV.map(pair) },
    { key: 'duplicate_cluster', label: 'Duplicate failure cluster', count: dupInq.size, sev: 'moderate', offending: dupR.map(rpair) },
    { key: 'provenance_break', label: 'Provenance chain break', count: brokenV.length, sev: 'critical', offending: brokenV.map(pair) },
    { key: 'trust_collapse', label: 'Trust score collapse', count: collapsedV.length, sev: 'critical', offending: collapsedV.map(pair) },
    { key: 'policy_violation', label: 'Policy violation', count: killedR.length, sev: 'major', offending: killedR.map(rpair) },
    { key: 'expired_evidence', label: 'Expired evidence', count: expiredV.length, sev: 'moderate', offending: expiredV.map(pair) },
  ].filter((a) => a.count > 0);
}

const STEPS = [
  { n: 1, title: 'Register', text: 'Name the system, assign an owner, and document its purpose and risk tier.' },
  { n: 2, title: 'Govern', text: 'Complete the 6 release gates, then move it through the lifecycle: draft → evaluated → approved → monitored.' },
  { n: 3, title: 'Monitor', text: 'Live signals (warrants, drift, reviews) raise alerts. Escalate routes the offending answers into the governance review queue.' },
];

export function SystemsContent() {
  const [systems, setSystems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isAdmin, setIsAdmin] = useState(true);
  const [form, setForm] = useState({ name: '', owner: '', purpose: '', domain: 'General', risk_tier: 'medium' });
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [silenced, setSilenced] = useState(() => new Set());
  const [flash, setFlash] = useState(null);
  const [evalId, setEvalId] = useState(null);
  const [evalText, setEvalText] = useState('');
  const [evalBusy, setEvalBusy] = useState(null);
  const [evalRunBusy, setEvalRunBusy] = useState(null);
  const [evalRun, setEvalRun] = useState({});
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const [sys, versions, warrants, reviews, corrections] = await Promise.all([
        base44.entities.AISystem.list('-created_date', 100),
        base44.entities.AnswerVersion.list('-created_date', 200),
        base44.entities.Warrant.list('-created_date', 200),
        base44.entities.Review.list('-created_date', 200),
        base44.entities.CorrectionEvent.list('-created_date', 200),
      ]);
      setSystems(sys);
      setAlerts(computeAlerts(versions, warrants, reviews, corrections));
    } catch {
      setSystems([]); setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    base44.auth.me().then((u) => setIsAdmin(u?.role === 'admin')).catch(() => setIsAdmin(false));
    // External changes (eval sweeps, approvals made elsewhere, drift alerts)
    // land outside this page's own actions — poll and refetch on focus so the
    // registry reflects reality instead of showing a stale snapshot.
    const poll = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(poll); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  // Continuous monitoring auto-escalation: critical alerts (provenance break,
  // trust collapse) route their offending answers into the review queue
  // automatically — no manual button click needed. Idempotent: skips answers
  // already in the queue and each alert key only fires once per session.
  const autoEscalatedRef = useRef(new Set());
  useEffect(() => {
    if (!alerts.length) return;
    const critical = alerts.filter((a) => a.sev === 'critical' && !autoEscalatedRef.current.has(a.key));
    if (!critical.length) return;
    critical.forEach((a) => autoEscalatedRef.current.add(a.key));
    (async () => {
      let created = 0;
      for (const a of critical) {
        const offending = (a.offending || []).filter((o) => o.answer_version_id);
        const seen = new Set();
        for (const o of offending.slice(0, 8)) {
          if (seen.has(o.answer_version_id)) continue;
          seen.add(o.answer_version_id);
          try {
            const existing = await base44.entities.Review.filter({ answer_version_id: o.answer_version_id }).catch(() => []);
            if (existing.length) continue;
            await base44.entities.Review.create({
              answer_version_id: o.answer_version_id, inquiry_id: o.inquiry_id,
              capability_level: 'L3', status: 'pending',
              decision: `Auto-escalated from monitoring alert "${a.label}"`,
            });
            created++;
            if (o.inquiry_id) await base44.entities.Inquiry.update(o.inquiry_id, { status: 'review' }).catch(() => {});
          } catch { /* skip */ }
        }
      }
      if (created > 0) setFlash({ tone: 'emerald', text: `Continuous monitoring auto-escalated ${created} answer${created === 1 ? '' : 's'} to the review queue.` });
    })();
  }, [alerts]);

  async function addSystem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy('add');
    try {
      await base44.entities.AISystem.create({
        name: form.name.trim(),
        owner: form.owner.trim() || 'Unassigned',
        purpose: form.purpose.trim(),
        domain: form.domain,
        risk_tier: form.risk_tier,
        lifecycle_state: 'draft',
        release_gates: {
          named_owner: !!form.owner.trim(),
          documented_purpose: !!form.purpose.trim(),
          evaluation_summary: false,
          review_completion: false,
          risk_signoff: false,
          rollback_criteria: false,
        },
        monitoring: {},
      });
      setForm({ name: '', owner: '', purpose: '', domain: 'General', risk_tier: 'medium' });
      await load();
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  async function setLifecycle(sys, state) {
    setSystems((prev) => prev.map((s) => (s.id === sys.id ? { ...s, lifecycle_state: state } : s)));
    setBusy(sys.id);
    try { await base44.entities.AISystem.update(sys.id, { lifecycle_state: state }); await load(); }
    catch { await load(); }
    finally { setBusy(null); }
  }

  function computeGates(sys) {
    const g = { ...(sys.release_gates || {}) };
    g.named_owner = !!(sys.owner && sys.owner !== 'Unassigned');
    g.documented_purpose = !!sys.purpose;
    g.evaluation_summary = !!sys.evaluation_summary;
    return g;
  }
  const HUMAN_GATES = ['review_completion', 'risk_signoff', 'rollback_criteria'];

  async function toggleGate(sys, gate) {
    const g = { ...(sys.release_gates || {}) };
    g[gate] = !g[gate];
    setSystems((prev) => prev.map((s) => (s.id === sys.id ? { ...s, release_gates: g } : s)));
    setBusy(sys.id);
    try { await base44.entities.AISystem.update(sys.id, { release_gates: g }); await load(); }
    catch { await load(); }
    finally { setBusy(null); }
  }

  function startEval(sys) { setEvalId(sys.id); setEvalText(sys.evaluation_summary || ''); }
  async function saveEval(sys) {
    setEvalBusy(sys.id);
    try {
      const g = computeGates({ ...sys, evaluation_summary: evalText });
      await base44.entities.AISystem.update(sys.id, { evaluation_summary: evalText.trim(), release_gates: g });
      setEvalId(null);
      await load();
    } catch { /* ignore */ } finally { setEvalBusy(null); }
  }

  async function signOff(sys) {
    const g = computeGates(sys);
    const missing = HUMAN_GATES.filter((k) => !g[k]);
    if (missing.length) {
      setFlash({ tone: 'slate', text: `Can't sign off "${sys.name}" — still needs: ${missing.map((m) => m.replace(/_/g, ' ')).join(', ')}.` });
      return;
    }
    const gates = { named_owner: true, documented_purpose: true, evaluation_summary: true, review_completion: true, risk_signoff: true, rollback_criteria: true };
    setBusy(sys.id);
    try {
      await base44.entities.AISystem.update(sys.id, { release_gates: gates, lifecycle_state: 'approved' });
      await base44.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'AISystem', entity_id: sys.id,
        summary: `${sys.name} release gates signed off → approved`, metadata: { system: sys.name },
      }).catch(() => {});
      setFlash({ tone: 'emerald', text: `"${sys.name}" approved — all release gates signed off.` });
      await load();
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  async function suspend(sys) {
    setBusy(sys.id);
    try {
      await base44.entities.AISystem.update(sys.id, { lifecycle_state: 'suspended' });
      await base44.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'AISystem', entity_id: sys.id,
        summary: `${sys.name} suspended by governance`, metadata: { system: sys.name },
      }).catch(() => {});
      setFlash({ tone: 'slate', text: `"${sys.name}" suspended.` });
      await load();
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  async function approveAllEligible() {
    setBusy('approve-all');
    let n = 0;
    for (const sys of systems) {
      if (['approved', 'retired', 'degraded', 'suspended'].includes(sys.lifecycle_state)) continue;
      const g = computeGates(sys);
      if (HUMAN_GATES.every((k) => g[k])) {
        const gates = { named_owner: true, documented_purpose: true, evaluation_summary: true, review_completion: true, risk_signoff: true, rollback_criteria: true };
        try {
          await base44.entities.AISystem.update(sys.id, { release_gates: gates, lifecycle_state: 'approved' });
          await base44.entities.AuditLog.create({
            event_type: 'gate_decision', entity_type: 'AISystem', entity_id: sys.id,
            summary: `${sys.name} auto-approved (all gates met)`, metadata: { system: sys.name, batch: true },
          }).catch(() => {});
          n++;
        } catch { /* skip */ }
      }
    }
    setBusy(null);
    setFlash(n > 0 ? { tone: 'emerald', text: `Auto-approved ${n} eligible system${n === 1 ? '' : 's'}.` } : { tone: 'slate', text: 'Nothing ready — some systems still need review completion, risk signoff, or rollback criteria.' });
    await load();
  }

  async function runEval(sys) {
    setEvalRunBusy(sys.id);
    setFlash({ tone: 'slate', text: `Running automated eval on "${sys.name}" — attesting prompts, red-teaming, and tribunal debate…` });
    try {
      const res = await base44.functions.invoke('runSystemEval', { system_id: sys.id });
      const r = res?.data || res;
      if (r?.error) { setFlash({ tone: 'slate', text: `Eval failed: ${r.error}` }); return; }
      setEvalRun((prev) => ({ ...prev, [sys.id]: r }));
      setFlash({ tone: r.verdict === 'ready' ? 'emerald' : 'slate', text: `Eval complete: ${r.recommendation}` });
      await load();
    } catch (e) {
      setFlash({ tone: 'slate', text: `Eval failed: ${(e && e.message) || e}` });
    } finally {
      setEvalRunBusy(null);
    }
  }

  async function runSweep() {
    const flagged = systems.filter((s) => ['degraded', 'suspended'].includes(s.lifecycle_state));
    if (!flagged.length) {
      setFlash({ tone: 'emerald', text: 'No degraded or suspended systems need recovery evaluation.' });
      return;
    }
    setSweepBusy(true);
    const results = [];
    try {
      for (let index = 0; index < flagged.length; index += 1) {
        const sys = flagged[index];
        setFlash({ tone: 'slate', text: `Re-evaluating ${index + 1} of ${flagged.length}: ${sys.name}…` });
        const res = await base44.functions.invoke('runSystemEvalSweep', { rehabilitate: true, system_ids: [sys.id] });
        const r = res?.data || res;
        if (r?.error) results.push({ id: sys.id, name: sys.name, passed: false, error: r.error });
        else results.push(...(r.results || []));
      }
      const failed = results.filter((r) => !r.passed);
      const report = { timestamp: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed, results };
      setSweepResult(report);
      setFlash(failed.length
        ? { tone: 'slate', text: `Recovery run complete: ${report.passed} restored, ${failed.length} still flagged.` }
        : { tone: 'emerald', text: `Recovery run complete: all ${report.total} flagged systems passed and were restored.` });
      await load();
    } catch (e) {
      setFlash({ tone: 'slate', text: `Recovery run failed: ${(e && e.message) || e}` });
    } finally {
      setSweepBusy(false);
    }
  }

  function recommend(sys) {
    const g = computeGates(sys);
    const m = sys.monitoring || {};
    const humanMissing = HUMAN_GATES.filter((k) => !g[k]);
    // Loosened: a single borderline signal shouldn't condemn a system. Only
    // flag "do not approve" when 2+ independent thresholds are breached (or one
    // is severe). One breach alone drops to the amber watch states below.
    const breach = (cond) => (cond ? 1 : 0);
    const breachCount =
      breach((Number(m.trust_drift) || 0) > 0.3) +
      breach((Number(m.performance_drift) || 0) > 0.4) +
      breach((Number(m.policy_violations) || 0) >= 3) +
      breach((Number(m.review_backlog) || 0) > 12) +
      breach(m.evidence_freshness != null && m.evidence_freshness < 0.4) +
      breach(m.correction_speed != null && m.correction_speed > 480);
    const severe = (Number(m.policy_violations) || 0) >= 3 || (Number(m.trust_drift) || 0) > 0.5;
    if (sys.lifecycle_state === 'suspended') {
      if (breachCount < 2 && !severe) return { label: 'Restore to monitored', tone: 'emerald', why: 'Signals have recovered — safe to resume monitoring.', action: 'restore' };
      return { label: 'Suspended', tone: 'rose', why: 'Trust signals still off — keep out of production until fixed.', action: 'none' };
    }
    if (sys.lifecycle_state === 'degraded') {
      if (breachCount < 2 && !severe) return { label: 'Restore to monitored', tone: 'emerald', why: 'Signals recovered — resume monitoring.', action: 'restore' };
      if (severe) return { label: 'Suspend now', tone: 'rose', why: 'Multiple trust signals still off — pull this from production.', action: 'suspend' };
      return { label: 'Degraded — re-run eval', tone: 'amber', why: `Eval flagged this system (${breachCount} signal${breachCount === 1 ? '' : 's'} off). Re-run eval after fixes; restore once it passes.`, action: 'eval' };
    }
    if (breachCount >= 2 || severe) return { label: 'Risky — do not approve', tone: 'rose', why: 'Multiple trust signals breached. Degrade until corrected.', action: 'degrade' };
    if (!g.evaluation_summary) return { label: 'Needs eval', tone: 'amber', why: 'No evaluation summary yet — run an eval and log the results.', action: 'eval' };
    if (humanMissing.length) return { label: 'Gates incomplete', tone: 'amber', why: `Still needs: ${humanMissing.map((x) => x.replace(/_/g, ' ')).join(', ')}.`, action: 'gates' };
    if (sys.lifecycle_state !== 'approved') return { label: 'Ready — approve', tone: 'emerald', why: 'All gates met and signals healthy. Clear to go live.', action: 'approve' };
    return { label: 'Healthy', tone: 'emerald', why: 'Approved and within healthy limits. Keep monitoring.', action: 'none' };
  }

  async function alertAction(alert, action) {
    setBusy('alert:' + alert.key);
    setFlash(null);
    try {
      if (action === 'silence') {
        setSilenced((s) => new Set(s).add(alert.key));
        await base44.entities.AuditLog.create({
          event_type: 'drift_alert', entity_type: 'Alert', entity_id: null,
          summary: `Monitoring alert "${alert.label}" silenced`,
          metadata: { alert: alert.key, action: 'silence' },
        }).catch(() => {});
        setFlash({ tone: 'slate', text: `"${alert.label}" silenced — it won't show again until signals change.` });
        return;
      }
      // Escalate: route the offending answers into the governance review queue automatically.
      const offending = (alert.offending || []).filter((o) => o.answer_version_id);
      const seen = new Set();
      let created = 0;
      for (const o of offending) {
        if (seen.has(o.answer_version_id)) continue;
        seen.add(o.answer_version_id);
        if (created >= 8) break;
        try {
          const existing = await base44.entities.Review.filter({ answer_version_id: o.answer_version_id }).catch(() => []);
          if (existing.length) continue;
          await base44.entities.Review.create({
            answer_version_id: o.answer_version_id,
            inquiry_id: o.inquiry_id,
            capability_level: 'L3',
            status: 'pending',
            decision: `Escalated from monitoring alert "${alert.label}"`,
          });
          created++;
          if (o.inquiry_id) await base44.entities.Inquiry.update(o.inquiry_id, { status: 'review' }).catch(() => {});
        } catch { /* skip duplicates */ }
      }
      await base44.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'Alert', entity_id: null,
        summary: `Monitoring alert "${alert.label}" escalated → ${created} review${created === 1 ? '' : 's'} routed to the governance queue`,
        metadata: { alert: alert.key, action: 'escalate', created },
      }).catch(() => {});
      setFlash({ tone: 'emerald', text: created > 0 ? `Escalated "${alert.label}" — ${created} answer${created === 1 ? '' : 's'} routed to the review queue.` : `"${alert.label}" had no routable answers to escalate.` });
      await load();
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Governance & Lifecycle</h1>
          <p className="text-sm text-slate-500">Register every AI deployment you run, sign off its release, and watch its trust health.</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-6 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-medium text-slate-200">Admin access required</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              AI System governance — registering deployments, signing off release gates, and viewing the registry — is restricted to admins. This keeps the accountability record tamper-proof. Ask a workspace admin to grant you the admin role if you need to govern systems here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const visibleAlerts = alerts.filter((a) => !silenced.has(a.key));
  const monitored = systems.filter((s) => s.lifecycle_state === 'monitored').length;
  const approved = systems.filter((s) => s.lifecycle_state === 'approved').length;
  const needsSignoff = systems.filter((s) => {
    const gates = s.release_gates || {};
    return GATES.some((g) => !gates[g]);
  }).length;
  const degraded = systems.filter((s) => ['degraded', 'suspended'].includes(s.lifecycle_state)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-semibold text-white">Governance & Lifecycle</h1>
        <p className="text-sm text-slate-500">Register every AI deployment you run, sign off its release, and watch its trust health.</p>
      </div>
      {flash && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${flash.tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>
          {flash.text}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-11 md:h-8 w-8 rounded-lg bg-emerald-400/10 flex items-center justify-center shrink-0">
            <Info className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-slate-200">What is an AI System?</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              An AI System is the <span className="text-slate-200">governance record</span> for a named, owned AI deployment — it isn't a running service, it's the paper trail that makes a model accountable. Each one carries an owner, a documented purpose, a risk tier, a lifecycle stage, a release-gate checklist, and a live health snapshot so every answer it produces can be tied back to a governed, sign-offable thing.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-5 w-5 rounded-full bg-emerald-400/15 text-emerald-300 text-[11px] font-semibold flex items-center justify-center">{s.n}</span>
                <span className="text-xs font-medium text-slate-200">{s.title}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#0B0F16] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Systems</div>
          <div className="text-lg font-semibold text-white">{systems.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0B0F16] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Monitored</div>
          <div className="text-lg font-semibold text-emerald-300">{monitored}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0B0F16] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Approved</div>
          <div className="text-lg font-semibold text-sky-300">{approved}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0B0F16] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Needs sign-off</div>
          <div className={`text-lg font-semibold ${needsSignoff > 0 ? 'text-amber-300' : 'text-slate-300'}`}>{needsSignoff}</div>
        </div>
      </div>
      {degraded > 0 && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2.5 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-xs text-rose-200">{degraded} system{degraded === 1 ? '' : 's'} degraded/suspended — auto-flagged by the eval sweep. Check each card's eval summary + monitoring below; re-run eval after fixes, then restore.</span>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <h2 className="text-sm font-medium text-slate-200">Continuous Monitoring</h2>
          <span className="text-[11px] text-slate-500">— {visibleAlerts.length} active alert{visibleAlerts.length === 1 ? '' : 's'}</span>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Computed live from your warrants, drift, reviews, and trust scores. <span className="text-emerald-300/80">Escalate</span> routes the offending answers into the governance review queue; <span className="text-slate-300">Silence</span> hides an alert until its signals change.</p>
        {visibleAlerts.length === 0 ? (
          <p className="text-xs text-slate-600 py-3">No active alerts. Signals are computed live from warrants, drift, reviews, and trust scores.</p>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map((a) => (
              <div key={a.key} className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${ALERT_SEV[a.sev] || ALERT_SEV.moderate}`}>{a.sev}</span>
                    <span className="text-xs text-slate-200">{a.label}</span>
                    <span className="text-[10px] text-slate-600">· {a.count}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button disabled={busy === 'alert:' + a.key} onClick={() => alertAction(a, 'escalate')} title="Route the offending answers into the governance review queue" className={`text-[10px] px-2 py-0.5 rounded border border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10 flex items-center gap-1 ${a.sev === 'critical' ? 'ring-1 ring-emerald-400/40 bg-emerald-400/10' : ''}`}>
                      {busy === 'alert:' + a.key ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Escalate
                    </button>
                    <button disabled={busy === 'alert:' + a.key} onClick={() => alertAction(a, 'silence')} title="Hide this alert until the underlying signals change" className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-400 hover:bg-white/5">Silence</button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{ALERT_DESC[a.key]} <span className="text-slate-400">Recommended: {ALERT_REC[a.sev]}.</span></p>
              </div>
            ))}
          </div>
        )}
      </div>

      {sweepResult && (
        <div className={`rounded-2xl border p-5 ${sweepResult.failed?.length ? 'border-rose-400/30 bg-rose-400/[0.04]' : 'border-emerald-400/20 bg-emerald-400/[0.03]'}`}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className={`h-4 w-4 ${sweepResult.failed?.length ? 'text-rose-400' : 'text-emerald-400'}`} />
            <h2 className="text-sm font-medium text-slate-200">Automated Eval Sweep</h2>
            <span className="text-[11px] text-slate-500">— {sweepResult.passed}/{sweepResult.total} passed, {sweepResult.failed?.length || 0} flagged</span>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">Ran {new Date(sweepResult.timestamp).toLocaleString()}. Each system was benchmarked with diagnostic prompts, red-team attacks, and a tribunal debate across five strict safety methods.</p>
          {sweepResult.failed?.length ? (
            <div className="space-y-2">
              {sweepResult.failed.map((f) => (
                <div key={f.id} className="rounded-lg bg-rose-400/[0.06] border border-rose-400/20 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-rose-200 font-medium">{f.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/15 text-rose-300 border border-rose-400/30">FAILED</span>
                    {f.degraded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">auto-degraded</span>}
                    {f.mean_trust != null && <span className="text-[10px] text-slate-500">trust {f.mean_trust}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Failed: {f.failed_methods?.join(', ') || 'thresholds'}{f.error ? ` — ${f.error}` : ''}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-300/80">All active systems passed every safety threshold. No flags.</p>
          )}
        </div>
      )}

      <form onSubmit={addSystem} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-slate-200">Register AI System</h2>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Registers as <span className="text-slate-300">draft</span>. Complete its gates and move it through the lifecycle once it's evaluated.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="System name" className="h-11 md:h-9 rounded-lg bg-[#070A0F] border border-white/10 px-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30" />
          <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owner" className="h-11 md:h-9 rounded-lg bg-[#070A0F] border border-white/10 px-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30" />
          <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Purpose" className="h-11 md:h-9 rounded-lg bg-[#070A0F] border border-white/10 px-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30" />
          <ResponsiveSelect
            value={form.domain}
            onValueChange={(v) => setForm({ ...form, domain: v })}
            options={['General', 'Medicine', 'Finance', 'Legal', 'Engineering'].map((d) => ({ value: d, label: d }))}
            placeholder="Domain"
            triggerClassName="h-11 md:h-9 rounded-lg bg-[#070A0F] border-white/10 px-3 text-xs text-slate-200"
          />
          <ResponsiveSelect
            value={form.risk_tier}
            onValueChange={(v) => setForm({ ...form, risk_tier: v })}
            options={['low', 'medium', 'high', 'regulated'].map((r) => ({ value: r, label: r }))}
            placeholder="Risk tier"
            triggerClassName="h-11 md:h-9 rounded-lg bg-[#070A0F] border-white/10 px-3 text-xs text-slate-200"
          />
        </div>
        <Button type="submit" disabled={busy === 'add'} className="mt-3 h-11 md:h-8 bg-emerald-400 text-[#070A0F] hover:bg-emerald-300">
          {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />} Register
        </Button>
      </form>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
          <Eye className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm font-medium text-slate-200">System Registry</h2>
          <span className="text-[11px] text-slate-500">— {systems.length} registered</span>
          <button onClick={approveAllEligible} disabled={busy === 'approve-all'} className="ml-auto text-[11px] px-2.5 py-2.5 md:py-1 min-h-[44px] md:min-h-0 rounded-lg border border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10 flex items-center gap-1.5 disabled:opacity-50">
            {busy === 'approve-all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve all eligible
          </button>
          <button onClick={runSweep} disabled={sweepBusy} title="Run diagnostics + red-team + tribunal on every active system, flagging failures" className="text-[11px] px-2.5 py-2.5 md:py-1 min-h-[44px] md:min-h-0 rounded-lg border border-sky-400/20 text-sky-300 hover:bg-sky-400/10 flex items-center gap-1.5 disabled:opacity-50">
            {sweepBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Re-run & restore systems
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/5 bg-white/[0.01] grid sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <GitBranch className="h-3 w-3 text-slate-500" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Lifecycle</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LIFECYCLE.map((l) => (
                <span key={l} title={LIFECYCLE_HINT[l]} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">{l}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="h-3 w-3 text-slate-500" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Release gates</span>
              <span className="text-[10px] text-slate-600">(all must be green before approval)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GATES.map((g) => (
                <span key={g} title={GATE_HINT[g]} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">{g.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        </div>

        {systems.length === 0 ? (
          <p className="text-sm text-slate-600 p-8 text-center">No AI systems registered yet. Register a system above to begin governance.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {systems.map((sys) => {
              const gates = computeGates(sys);
              const gateCount = GATES.filter((g) => gates[g]).length;
              const m = sys.monitoring || {};
              const rec = recommend(sys);
              const isDegraded = ['degraded', 'suspended'].includes(sys.lifecycle_state);
              return (
                <div key={sys.id} className={`p-4 ${isDegraded ? 'bg-rose-400/[0.03]' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm text-slate-200 font-medium">{sys.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_STYLES[sys.risk_tier] || RISK_STYLES.medium}`}>{sys.risk_tier}</span>
                        <span className="text-[10px] text-slate-500" title={LIFECYCLE_HINT[sys.lifecycle_state]}>{sys.lifecycle_state}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span title={rec.why} className={`text-[10px] px-1.5 py-0.5 rounded border ${REC_STYLES[rec.tone]}`}>Recommendation: {rec.label}</span>
                        <span className="text-[11px] text-slate-500">{rec.why}</span>
                      </div>
                      <p className="text-xs text-slate-400">{sys.purpose || 'No documented purpose.'}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Owner: {sys.owner || 'Unassigned'} · {sys.domain}</p>
                      {evalId === sys.id ? (
                        <div className="mt-1.5 flex items-start gap-2">
                          <textarea value={evalText} onChange={(e) => setEvalText(e.target.value)} placeholder="Summarize the eval results (e.g. '94% warrant rate on 12k cases')." className="flex-1 min-h-[44px] rounded-lg bg-[#070A0F] border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30 resize-y" />
                          <div className="flex flex-col gap-1">
                            <button onClick={() => saveEval(sys)} disabled={evalBusy === sys.id} className="text-[10px] px-2 py-0.5 rounded border border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10 flex items-center">{evalBusy === sys.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}</button>
                            <button onClick={() => setEvalId(null)} className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-400 hover:bg-white/5">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => startEval(sys)} className="text-[11px] text-slate-500 mt-1.5 italic hover:text-emerald-300 text-left">
                          {sys.evaluation_summary ? `"${sys.evaluation_summary}"` : '+ add evaluation summary'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" disabled={evalRunBusy === sys.id || busy === sys.id} onClick={() => runEval(sys)} title="Auto-run test prompts, red-team, and tribunal — leaves the final call to you" className="h-11 md:h-8 border-sky-400/30 text-sky-300 hover:bg-sky-400/10 text-[11px]">
                        {evalRunBusy === sys.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1.5" />}Run eval
                      </Button>
                      <ResponsiveSelect
                        value={sys.lifecycle_state}
                        disabled={busy === sys.id}
                        onValueChange={(v) => setLifecycle(sys, v)}
                        options={LIFECYCLE.map((l) => ({ value: l, label: l }))}
                        placeholder="Lifecycle"
                        triggerClassName="h-11 md:h-8 rounded-lg bg-[#070A0F] border-white/10 px-2 text-[11px] text-slate-200"
                      />
                      {rec.action === 'suspend' && (
                        <Button size="sm" variant="outline" disabled={busy === sys.id} onClick={() => suspend(sys)} className="h-11 md:h-8 border-rose-400/50 text-rose-200 bg-rose-400/10 text-[11px] ring-1 ring-rose-400/40">
                          Suspend
                        </Button>
                      )}
                      {rec.action === 'degrade' && (
                        <Button size="sm" variant="outline" disabled={busy === sys.id} onClick={() => setLifecycle(sys, 'degraded')} className="h-11 md:h-8 border-rose-400/50 text-rose-200 bg-rose-400/10 text-[11px] ring-1 ring-rose-400/40">
                          Degrade
                        </Button>
                      )}
                      {rec.action === 'restore' && (
                        <Button size="sm" variant="outline" disabled={busy === sys.id} onClick={() => setLifecycle(sys, 'monitored')} className="h-11 md:h-8 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 text-[11px]">
                          Restore
                        </Button>
                      )}
                      {rec.action !== 'suspend' && rec.action !== 'degrade' && rec.action !== 'restore' && rec.action !== 'eval' && (
                        <Button size="sm" variant="outline" disabled={sys.lifecycle_state === 'approved' || isDegraded || busy === sys.id} onClick={() => signOff(sys)} title="Auto-fills provable gates and approves once all 6 gates are met" className={`h-11 md:h-8 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 text-[11px] ${rec.action === 'approve' ? 'ring-1 ring-emerald-400/50 bg-emerald-400/10' : ''}`}>
                          {sys.lifecycle_state === 'approved' ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Signed off</> : 'Sign off & approve'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Release gates:</span>
                    <span className="text-[10px] text-slate-600">click to toggle</span>
                    {GATES.map((g) => {
                      const provable = ['named_owner', 'documented_purpose', 'evaluation_summary'].includes(g);
                      return (
                        <button key={g} title={provable ? `${GATE_HINT[g]} (auto-filled from data)` : `${GATE_HINT[g]} (click to toggle)`} disabled={provable || busy === sys.id} onClick={() => toggleGate(sys, g)} className={`text-[10px] px-2 py-1.5 rounded transition-colors ${gates[g] ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-600 hover:bg-white/10'} ${provable ? 'cursor-default' : 'cursor-pointer'}`}>
                          {g.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                    <span className="text-[10px] text-slate-500 ml-1">{gateCount}/{GATES.length}</span>
                  </div>

                  {Object.keys(m).length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      <Metric label="Perf. drift" value={m.performance_drift} good={0.05} warn={0.12} fmt="pct" />
                      <Metric label="Trust drift" value={m.trust_drift} good={0.03} warn={0.08} fmt="signedPct" />
                      <Metric label="Policy viol." value={m.policy_violations} good={0} warn={1} fmt="num" />
                      <Metric label="Review backlog" value={m.review_backlog} good={3} warn={8} fmt="num" />
                      <Metric label="Evidence fresh" value={m.evidence_freshness} good={0.85} warn={0.7} fmt="pct" invert />
                      <Metric label="Correct. speed" value={m.correction_speed} good={120} warn={360} fmt="sec" />
                    </div>
                  )}

                  {evalRun[sys.id] && (
                    <EvalResults r={evalRun[sys.id]} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Systems() {
  return <AppShell><SystemsContent /></AppShell>;
}

function EvalResults({ r }) {
  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.03] p-3">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-xs font-medium text-slate-200">Automated eval — {r.system_name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.verdict === 'ready' ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' : 'bg-rose-400/15 text-rose-300 border-rose-400/30'}`}>
          {r.verdict === 'ready' ? 'READY — your call' : 'DO NOT APPROVE'}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">{r.recommendation}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mb-2">
        {(r.methods || []).map((mth) => (
          <div key={mth.name} className={`rounded border px-2 py-1.5 ${mth.passed ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-rose-400/20 bg-rose-400/[0.05]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-200">{mth.name}</span>
              <span className={`text-[11px] ${mth.passed ? 'text-emerald-300' : 'text-rose-300'}`}>{mth.passed ? '✓ PASS' : '✗ FAIL'}</span>
            </div>
            <div className="text-[10px] text-slate-400">{mth.value} <span className="text-slate-600">· threshold {mth.threshold}</span></div>
            <div className="text-[10px] text-slate-600 mt-0.5">{mth.note}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-500 italic">{r.summary}</div>
      <div className="mt-2 text-[10px] text-slate-500">{r.per_prompt?.length || 0} prompts attested · {r.red_team?.length || 0} red-team attacks · {r.tribunal?.length || 0} tribunal debates. Final decision is yours — use the gate toggles + Sign off & approve above.</div>
    </div>
  );
}

function Metric({ label, value, good, warn, fmt, invert }) {
  if (value == null) return null;
  const toneFor = (v) => {
    if (invert) {
      if (v >= good) return 'text-emerald-300';
      if (v >= warn) return 'text-amber-300';
      return 'text-rose-300';
    }
    if (v <= good) return 'text-emerald-300';
    if (v <= warn) return 'text-amber-300';
    return 'text-rose-300';
  };
  const fmtVal = (v) => {
    if (fmt === 'num') return String(v);
    if (fmt === 'sec') return `${Math.round(v / 60)}m`;
    if (fmt === 'signedPct') return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
    return `${(v * 100).toFixed(0)}%`;
  };
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{label}</div>
      <div className={`text-xs font-semibold ${toneFor(value)}`}>{fmtVal(value)}</div>
    </div>
  );
}