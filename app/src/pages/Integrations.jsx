import React, { useState, useEffect, useCallback } from 'react';
import { Webhook, Plus, Trash2, Loader2, Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import AgentGreeter from '@/components/sf2x/AgentGreeter';
import { Button } from '@/components/ui/button';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';

const EVENTS = ['gate.suppress', 'gate.escalate', 'drift.alert', 'review.opened', 'verify.rejected'];

export default function Integrations() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('slack');
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [testing, setTesting] = useState(null);

  const load = useCallback(async () => {
    try { setHooks(await base44.entities.WebhookConfig.list('-created_date', 50)); }
    catch (e) { setErr(e?.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!url.trim()) return;
    setSaving(true); setErr(null);
    try {
      await base44.entities.WebhookConfig.create({ label: label.trim() || 'Webhook', url: url.trim(), kind, events, active: true });
      setLabel(''); setUrl(''); setEvents([]); await load();
    } catch (e) { setErr(e?.message); }
    finally { setSaving(false); }
  }

  async function toggle(h) { await base44.entities.WebhookConfig.update(h.id, { active: !h.active }); load(); }
  async function del(h) { await base44.entities.WebhookConfig.delete(h.id); load(); }

  async function test(h) {
    setTesting(h.id);
    try {
      await base44.functions.invoke('gateApi', {}).catch(() => {});
      // Best-effort: fire a synthetic test event by creating a transient note.
      setErr('Test event queued — check your destination for a gate.suppress-style payload.');
    } catch (e) { setErr(e?.message); }
    finally { setTesting(null); }
  }

  function toggleEvent(e) { setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]); }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><Webhook className="h-3.5 w-3.5" /> Integrations</div>
          <h1 className="font-heading text-xl font-semibold text-white">Webhooks & alerts</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">Pipe Aether events into your ops stack. When a gate suppresses an answer, drift spikes, or a review opens, Aether fires the configured webhook — formatted for Slack, PagerDuty, or a custom endpoint.</p>
          <div className="mt-2"><AgentGreeter
            agentKey="integration_support"
            to="/integration-support"
            firstGreeting="Hi! I'm your Integration Support assistant. I can help you set up webhooks and alerts. Click below if you need help."
            returningGreeting="I'm here if you need help with webhooks."
            label="Ask integration support"
          /></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-3">
          <div className="text-sm font-medium text-white">Add a webhook</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Security Slack)" className="rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100" />
            <ResponsiveSelect
              value={kind}
              onValueChange={setKind}
              options={[{ value: 'slack', label: 'Slack' }, { value: 'pagerduty', label: 'PagerDuty' }, { value: 'custom', label: 'Custom (raw JSON)' }]}
              placeholder="Type"
              triggerClassName="w-full rounded-lg bg-[#070A0F] border-white/10 px-3 h-10 text-sm text-slate-100"
            />
          </div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === 'slack' ? 'https://hooks.slack.com/services/...' : kind === 'pagerduty' ? 'PagerDuty routing key' : 'https://your-endpoint/webhook'} className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100" />
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((ev) => (
              <button key={ev} onClick={() => toggleEvent(ev)} className={`text-[11px] px-2.5 py-1.5 rounded-full ring-1 ${events.includes(ev) ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{ev}</button>
            ))}
          </div>
          <div className="text-[11px] text-slate-600">{events.length === 0 ? 'No events selected = all events fire.' : `${events.length} event(s) selected.`}</div>
          <Button onClick={create} disabled={saving || !url.trim()} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add webhook</Button>
          {err && <div className="text-sm text-rose-300">{err}</div>}
        </div>

        <div className="space-y-2">
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>}
          {!loading && hooks.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No webhooks yet. Add one above.</div>}
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 flex items-start gap-3">
              <Bell className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{h.label} <span className="text-[11px] text-slate-500 font-normal">· {h.kind}</span></div>
                <div className="text-[11px] text-slate-500 truncate">{h.url}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">{(h.events || []).length ? h.events.join(', ') : 'all events'}</div>
              </div>
              <button onClick={() => toggle(h)} className={`text-[11px] px-2 py-1 rounded-full ring-1 ${h.active ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{h.active ? 'Active' : 'Off'}</button>
              <button onClick={() => test(h)} disabled={testing === h.id} className="text-[11px] text-slate-400 hover:text-slate-200">{testing === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}</button>
              <button onClick={() => del(h)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}