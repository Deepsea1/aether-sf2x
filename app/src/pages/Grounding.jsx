import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, Loader2, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import { Button } from '@/components/ui/button';

const DOMAINS = ['general', 'Medicine', 'Legal', 'HR', 'Finance', 'Engineering'];

export default function Grounding() {
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
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><BookOpen className="h-3.5 w-3.5" /> Custom Grounding</div>
          <h1 className="font-heading text-xl font-semibold text-white">Authoritative documents</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">Upload your own source of truth — HR handbook, compliance policy, product spec, SOP. Every verification is checked against <span className="text-slate-300">your</span> documents first, not just the open web. Reference these by ID in the <code className="text-slate-400">grounding_doc_ids</code> API field.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-3">
          <div className="text-sm font-medium text-white">Add a document</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document title (e.g. HR Handbook v3)" className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100" />
          <div className="flex gap-2">
            <ResponsiveSelect
              value={domain}
              onValueChange={setDomain}
              options={DOMAINS.map((d) => ({ value: d, label: d }))}
              triggerClassName="h-10 flex-1"
            />
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Paste the authoritative document text here (up to ~8000 chars)..." className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 resize-none" />
          <div className="text-[11px] text-slate-600">{content.length}/8000 chars</div>
          <Button onClick={create} disabled={saving || !name.trim() || !content.trim()} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add document
          </Button>
          {err && <div className="text-sm text-rose-300">{err}</div>}
        </div>

        <div className="space-y-2">
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>}
          {!loading && docs.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No documents yet. Add one above.</div>}
          {docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{d.name}</div>
                <div className="text-[11px] text-slate-500">{d.domain} · {(d.content || '').length} chars · <span className="font-mono">{d.id}</span></div>
              </div>
              <button onClick={() => toggle(d)} className={`text-[11px] px-2 py-1 rounded-full ring-1 ${d.active ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{d.active ? 'Active' : 'Off'}</button>
              <button onClick={() => del(d)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}