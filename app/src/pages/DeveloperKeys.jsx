import React, { useEffect, useState, useCallback } from 'react';
import { KeyRound, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';

export default function DeveloperKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [shown, setShown] = useState({});
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState(null);
  const [sub, setSub] = useState(null);

  const load = useCallback(async () => {
    try {
      const [k, subs] = await Promise.all([
        base44.entities.ApiKey.list('-created_date', 50),
        base44.entities.Subscription.list('-created_date', 5),
      ]);
      setKeys(k || []);
      setSub((subs || [])[0]);
    } catch (e) { setErr(e?.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setCreating(true); setErr(null); setNewKey(null);
    try {
      const res = await base44.functions.invoke('generateApiKey', {});
      const d = res?.data || res;
      if (d?.error) setErr(d.error);
      else { setNewKey(d); await load(); }
    } catch (e) { setErr(e?.message || 'Could not generate key.'); }
    finally { setCreating(false); }
  }

  async function toggle(k) { await base44.entities.ApiKey.update(k.id, { active: !k.active }); load(); }
  async function del(k) { await base44.entities.ApiKey.delete(k.id); load(); }
  function copy(text, id) { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); }

  const plan = sub?.plan || 'starter';
  const limits = { starter: '500/mo', pro: '25,000/mo', enterprise: '250,000/mo', scale: 'Unlimited', 'api-access': '10,000 credits/mo', 'api-access-pro': '50,000 credits/mo' }[plan] || '500/mo';

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><KeyRound className="h-3.5 w-3.5" /> Developer API Keys</div>
          <h1 className="font-heading text-xl font-semibold text-white">Your API keys</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">Generate keys to call <code className="text-slate-400">/verify</code>, <code className="text-slate-400">/tribunal</code>, and <code className="text-slate-400">/batch</code> from your code. Keep them secret — they meter your monthly verification quota.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4"><div className="text-[11px] text-slate-500">Plan</div><div className="text-base font-semibold text-white capitalize">{plan}</div></div>
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4"><div className="text-[11px] text-slate-500">Rate limit</div><div className="text-base font-semibold text-white">{limits}</div></div>
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4"><div className="text-[11px] text-slate-500">Status</div><div className="text-base font-semibold text-emerald-300 capitalize">{sub?.status || 'active'}</div></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Generate a new key</div>
            <div className="text-[12px] text-slate-500">The full key is shown only once — copy it now.</div>
          </div>
          <Button onClick={create} disabled={creating} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New key</Button>
        </div>

        {newKey && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4">
            <div className="flex items-center gap-2 mb-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><span className="text-sm font-medium text-emerald-200">New key created</span></div>
            <div className="flex items-center gap-2 bg-black/50 rounded-lg p-2.5 border border-white/5">
              <code className="text-[12px] text-emerald-200 font-mono flex-1 truncate">{newKey.key || newKey.api_key}</code>
              <button onClick={() => copy(newKey.key || newKey.api_key, 'new')} className="text-slate-400 hover:text-white">{copied === 'new' ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}</button>
            </div>
          </div>
        )}

        {err && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {err}</div>}

        <div className="space-y-2">
          {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>}
          {!loading && keys.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No keys yet. Generate one above.</div>}
          {keys.map((k) => (
            <div key={k.id} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 flex items-center gap-3">
              <KeyRound className={`h-5 w-5 ${k.active ? 'text-emerald-400' : 'text-slate-600'} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-[12px] font-mono text-slate-300 truncate">{shown[k.id] ? k.key : (k.key || '').slice(0, 10) + '••••••••••••'}</code>
                  <button onClick={() => setShown((s) => ({ ...s, [k.id]: !s[k.id] }))} className="text-slate-500 hover:text-slate-300">{shown[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  <button onClick={() => copy(k.key, k.id)} className="text-slate-500 hover:text-slate-300">{copied === k.id ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">{k.label || 'API key'} · created {(k.created_date || '').slice(0, 10)}</div>
              </div>
              <button onClick={() => toggle(k)} className={`text-[11px] px-2 py-1 rounded-full ring-1 ${k.active ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-500 ring-white/10'}`}>{k.active ? 'Active' : 'Revoked'}</button>
              <button onClick={() => del(k)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}