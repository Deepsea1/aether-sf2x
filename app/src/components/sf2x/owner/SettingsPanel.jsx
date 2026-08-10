import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, Loader2, FileText, Webhook, Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';

const DOMAINS = ['general', 'Medicine', 'Legal', 'HR', 'Finance', 'Engineering'];
const EVENTS = ['gate.suppress', 'gate.escalate', 'drift.alert', 'review.opened', 'verify.rejected'];

export default function SettingsPanel() {
  return (
    <div className="space-y-8">
      <GroundingSection />
      <WebhookSection />
    </div>
  );
}

function GroundingSection() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('general');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try { setDocs(await base44.entities.GroundingDoc.list('-created_date', 100)); }
    catch (e) { setErr(e?.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true); setErr(null);
    try {
      await base44.entities.GroundingDoc.create({ name: name.trim(), domain, content: content.trim().slice(0, 8000), active: true, source: 'manual' });
      setName(''); setContent(''); await load();
    } catch (e) { setErr(e?.message); }
    finally { setSaving(false); }
  }
  async function toggle(d) { await base44.entities.GroundingDoc.update(d.id, { active: !d.active }); load(); }
  async function del(d) { await base44.entities.GroundingDoc.delete(d.id); load(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-emerald-400" />
        <h2 className="font-heading text-base font-semibold text-white">Grounding Documents</h2>
      </div>
      <p className="text-[13px] text-slate-500 max-w-2xl">Upload your own source of truth — HR handbook, compliance policy, product spec. Every verification checks <span className="text-slate-300">your</span> documents first.</p>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document title (e.g. HR Handbook v3)" className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100" />
        <ResponsiveSelect
          value={domain}
          onValueChange={setDomain}
          options={DOMAINS.map((d) => ({ value: d, label: d }))}
          placeholder="Domain"
          triggerClassName="w-full rounded-lg bg-[#070A0F] border-white/10 px-3 h-10 text-sm text-slate-100"
        />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Paste authoritative text (up to ~8000 chars)..." className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 resize-none" />
        <div className="text-[11px] text-slate-600">{content.length}/8000 chars</div>
        <Button onClick={create} disabled={saving || !name.trim() || !content.trim()} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add document</Button>
        {err && <div className="text-sm text-rose-300">{err}</div>}
      </div>

      <div className="space-y-2">
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>}
        {!loading && docs.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No documents yet.</div>}
        {docs.map((d) => (
          <div key={d.id} className="rounded-xl border border-white/10 bg-[#0B0F16] p-3 flex items-center gap-3">
            <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{d.name}</div>
              <div className="text-[11px] text-slate-500">{d.domain} · {(d.content || '').length} chars</div>
            </div>
            <button onClick={() => toggle(d)} className={`text-[11px] px-2 py-1 rounded-full ring-1 ${d.active ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{d.active ? 'Active' : 'Off'}</button>
            <button onClick={() => del(d)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebhookSection() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('slack');
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

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
  function toggleEvent(e) { setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-emerald-400" />
        <h2 className="font-heading text-base font-semibold text-white">Webhooks & Alerts</h2>
      </div>
      <p className="text-[13px] text-slate-500 max-w-2xl">Pipe Aether events into Slack, PagerDuty, or a custom endpoint. Fires on gate suppressions, drift spikes, and review openings.</p>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 space-y-3">
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
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === 'slack' ? 'https://hooks.slack.com/services/...' : 'https://your-endpoint/webhook'} className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100" />
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
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>}
        {!loading && hooks.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No webhooks yet.</div>}
        {hooks.map((h) => (
          <div key={h.id} className="rounded-xl border border-white/10 bg-[#0B0F16] p-3 flex items-start gap-3">
            <Bell className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{h.label} <span className="text-[11px] text-slate-500 font-normal">· {h.kind}</span></div>
              <div className="text-[11px] text-slate-500 truncate">{h.url}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{(h.events || []).length ? h.events.join(', ') : 'all events'}</div>
            </div>
            <button onClick={() => toggle(h)} className={`text-[11px] px-2 py-1 rounded-full ring-1 ${h.active ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{h.active ? 'Active' : 'Off'}</button>
            <button onClick={() => del(h)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}