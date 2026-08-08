import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Zap, Swords, Crosshair } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import DebatePanel from '@/components/sf2x/DebatePanel';
import {
  buildDebatePrompt, DEBATE_JSON_SCHEMA, buildRedTeamPrompt, REDTEAM_JSON_SCHEMA,
  REDTEAM_VECTORS, OUTCOME_STYLES,
} from '@/lib/sf2xCollective';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { formatDistanceToNow } from 'date-fns';

export default function Collective() {
  const [inquiries, setInquiries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [debate, setDebate] = useState(null);
  const [runs, setRuns] = useState([]);
  const [vector, setVector] = useState('prompt_injection');
  const [busyDebate, setBusyDebate] = useState(false);
  const [busyRed, setBusyRed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadInquiries = useCallback(async () => {
    const list = await base44.entities.Inquiry.list('-created_date', 50);
    setInquiries(list);
    if (list.length) await pickInquiry(list[0].id, list);
    setLoading(false);
  }, []);

  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  async function pickInquiry(id, listArg) {
    const inquiry = (listArg || inquiries).find((i) => i.id === id) || await base44.entities.Inquiry.get(id);
    const versions = await base44.entities.AnswerVersion.filter({ inquiry_id: id }, 'version', 50);
    if (!versions.length) {
      setSelected({ inquiry, version: null, warrant: null, versions: [] });
      setDebate(null); setRuns([]);
      return;
    }
    const latest = versions[versions.length - 1];
    let warrant = null;
    if (latest.warrant_id) warrant = await base44.entities.Warrant.get(latest.warrant_id).catch(() => null);
    setSelected({ inquiry, version: latest, warrant, versions });

    const debates = await base44.entities.Debate.filter({ inquiry_id: id }, '-created_date', 10);
    setDebate(debates.find((d) => d.answer_version_id === latest.id) || debates[0] || null);

    const allRuns = await base44.entities.RedTeamRun.list('-created_date', 100);
    const vids = new Set(versions.map((v) => v.id));
    setRuns(allRuns.filter((r) => vids.has(r.target_id)));
  }

  async function runDebate() {
    if (!selected?.version || busyDebate) return;
    setBusyDebate(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: buildDebatePrompt(selected.inquiry.prompt, selected.version.answer_text, selected.warrant, selected.inquiry.domain, selected.inquiry.stakes_level),
        response_json_schema: DEBATE_JSON_SCHEMA,
      });
      const r = res && res.data ? res.data : res;
      const d = await base44.entities.Debate.create({
        inquiry_id: selected.inquiry.id,
        answer_version_id: selected.version.id,
        proposer: r.proposer, critic: r.critic, verifier: r.verifier,
        consensus: r.consensus,
        verdict_confidence: r.verifier?.confidence ?? 0,
        minority_report: r.minority_report || '',
      });
      await base44.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'Debate', entity_id: d.id,
        summary: `Tribunal verdict: ${r.consensus} (conf ${Math.round((r.verifier?.confidence || 0) * 100)}%)`,
        metadata: { consensus: r.consensus },
      }).catch(() => {});
      setDebate(d);
    } catch {
      /* debate failed */
    } finally {
      setBusyDebate(false);
    }
  }

  async function runRedTeam() {
    if (!selected?.version || busyRed) return;
    setBusyRed(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: buildRedTeamPrompt(vector, selected.inquiry.prompt, selected.version.answer_text, selected.warrant, selected.inquiry.domain),
        response_json_schema: REDTEAM_JSON_SCHEMA,
      });
      const r = res && res.data ? res.data : res;
      const trust = computeTrustworthyRate(selected.version.metrics, selected.warrant);
      const run = await base44.entities.RedTeamRun.create({
        target_id: selected.version.id, inquiry_id: selected.inquiry.id,
        attack_vector: vector, attack_prompt: r.attack_prompt, response_text: r.response,
        outcome: r.outcome, severity: r.severity, trust_after: trust, notes: r.notes || '',
      });
      await base44.entities.AuditLog.create({
        event_type: 'drift_alert', entity_type: 'RedTeamRun', entity_id: run.id,
        summary: `Red-team ${vector} → ${r.outcome} (${r.severity})`,
        metadata: { outcome: r.outcome, severity: r.severity },
      }).catch(() => {});
      setRuns((prev) => [run, ...prev]);
    } catch {
      /* red-team failed */
    } finally {
      setBusyRed(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const hasVersion = !!selected?.version;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Red Team</h1>
          <p className="text-sm text-slate-500">Multi-role tribunal (proposer · critic · verifier) and an adversarial red-team attack simulator.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Target inquiry</label>
              <ResponsiveSelect
                value={selected?.inquiry?.id || undefined}
                onValueChange={(v) => pickInquiry(v)}
                options={inquiries.map((i) => ({ value: i.id, label: `${i.domain} · ${i.prompt.slice(0, 50)}` }))}
                placeholder="No inquiries yet"
                triggerClassName="w-full h-9 rounded-lg border border-white/10 bg-[#070A0F] px-3 text-sm text-slate-200"
              />
            </div>
            <div className="flex items-end">
              {selected?.inquiry && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">Answer v{selected.version?.version}</span>
                  {selected.warrant && <span className="ml-2 text-slate-500">· warrant {selected.warrant.validity_status}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Button onClick={runDebate} disabled={!hasVersion || busyDebate}
              className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40">
              {busyDebate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Swords className="h-4 w-4 mr-2" />} Run Tribunal
            </Button>
            <div className="h-px w-px" />
            <ResponsiveSelect
              value={vector}
              onValueChange={setVector}
              disabled={!hasVersion}
              options={REDTEAM_VECTORS.map((v) => ({ value: v.value, label: v.label }))}
              placeholder="Attack vector"
              triggerClassName="h-9 rounded-lg border border-white/10 bg-[#070A0F] px-3 text-sm text-slate-200 disabled:opacity-40"
            />
            <Button onClick={runRedTeam} disabled={!hasVersion || busyRed} variant="outline"
              className="border-rose-400/30 text-rose-300 hover:bg-rose-400/10 disabled:opacity-40">
              {busyRed ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />} Run Attack
            </Button>
          </div>
        </div>

        {!hasVersion && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="text-sm text-slate-400">Select a warranted inquiry to convene a tribunal or run a red-team attack.</p>
          </div>
        )}

        {hasVersion && (
          <>
            {busyDebate && (
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-8 flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
                <p className="text-sm text-slate-400">Proposer, critic, and verifier are deliberating…</p>
              </div>
            )}
            {!busyDebate && debate && <DebatePanel debate={debate} />}

            <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-rose-400" />
                <h3 className="text-sm font-medium text-slate-200">Red-Team Log</h3>
                <span className="text-[11px] text-slate-500">— {runs.length} attack{runs.length === 1 ? '' : 's'}</span>
              </div>
              {runs.length === 0 ? (
                <p className="text-xs text-slate-600 py-4 text-center">No attacks run yet. Pick a vector and run an attack.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((r) => {
                    const o = OUTCOME_STYLES[r.outcome] || OUTCOME_STYLES.resisted;
                    return (
                      <div key={r.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">{r.attack_vector.replace(/_/g, ' ')}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.bg} ${o.text}`}>{o.label} · {r.severity}</span>
                        </div>
                        <p className="text-xs text-slate-400">{r.notes}</p>
                        <span className="text-[10px] text-slate-600">{formatDistanceToNow(new Date(r.created_date), { addSuffix: true })}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}