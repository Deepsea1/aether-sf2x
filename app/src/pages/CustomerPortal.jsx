import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Loader2, Copy, Check, XCircle, Sparkles, Activity, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const PLAN_LIMITS = { starter: 2000, pro: 25000 };

export default function CustomerPortal() {
  const [user, setUser] = useState(null);
  const [sub, setSub] = useState(null);
  const [keys, setKeys] = useState([]);
  const [usage, setUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState(null);
  const [delStep, setDelStep] = useState(0);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const [subs, allKeys, inqs] = await Promise.all([
        base44.entities.Subscription.filter({}),
        base44.entities.ApiKey.filter({}),
        base44.entities.Inquiry.filter({}),
      ]);
      setSub(subs.find((s) => s.user_id === u.id) || null);
      setKeys(allKeys.filter((k) => k.user_id === u.id));
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      setUsage(inqs.filter((i) => i.customer_id === u.id && new Date(i.created_date) >= monthStart).length);
    } catch (e) {
      setMsg(e?.message || 'Failed to load account.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateKey() {
    setBusy('key');
    try { await base44.functions.invoke('generateApiKey', {}); await load(); }
    catch (e) { setMsg(e?.message || 'Failed to generate key.'); } finally { setBusy(null); }
  }
  async function cancel() {
    if (!window.confirm('Cancel your subscription? Access continues until period end, then stops.')) return;
    setBusy('cancel');
    try { await base44.functions.invoke('cancelSubscription', {}); await load(); setMsg('Subscription canceled.'); }
    catch (e) { setMsg(e?.message || 'Failed to cancel.'); } finally { setBusy(null); }
  }
  async function performDeletion() {
    setDelBusy(true);
    try {
      // Trigger backend cleanup of the user's data before clearing the session.
      const res = await base44.functions.invoke('deleteAccount', {});
      const d = res?.data || res;
      if (d?.error) { setDelBusy(false); setMsg(d.error); return; }
      // Clear the local session/tokens and return to login.
      await base44.auth.logout('/login');
    } catch (e) {
      setDelBusy(false);
      setMsg(e?.message || 'Failed to delete account. Please try again.');
    }
  }

  const plan = sub?.plan || 'starter';
  const limit = PLAN_LIMITS[plan] || 2000;
  const activeKey = keys.find((k) => k.active);

  return (
    <AppShell>
      <h1 className="font-heading text-xl font-semibold text-white mb-1">Customer Portal</h1>
      <p className="text-sm text-slate-500 mb-6">Manage your subscription, API key, and usage.</p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-slate-500 animate-spin" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <div className="flex items-center gap-2 text-sm text-emerald-300 mb-3"><Sparkles className="h-4 w-4" /> Subscription</div>
            {sub ? (
              <div className="space-y-2 text-sm">
                <Row label="Plan" value={<span className="capitalize text-white">{plan}</span>} />
                <Row label="Status" value={<span className={sub.status === 'active' ? 'text-emerald-300' : 'text-rose-300'}>{sub.status}</span>} />
                <Row label="Seats" value={sub.seats || 1} />
                {sub.current_period_end && <Row label="Period ends" value={new Date(sub.current_period_end).toLocaleDateString()} />}
                <div className="pt-3">
                  <Button size="sm" variant="outline" onClick={cancel} disabled={busy === 'cancel'}
                    className="h-8 border-white/10 bg-transparent text-rose-300 hover:bg-rose-400/10">
                    {busy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />} Cancel subscription
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No active subscription. <a href="/pricing" className="text-emerald-300 underline">Choose a plan</a>.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <div className="flex items-center gap-2 text-sm text-emerald-300 mb-3"><Activity className="h-4 w-4" /> Usage this month</div>
            <div className="text-3xl font-semibold text-white">{usage} <span className="text-base text-slate-500">/ {limit}</span></div>
            <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-600" style={{ width: `${Math.min(100, (usage / limit) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Inquiries reset on the 1st of each month.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm text-emerald-300 mb-3"><KeyRound className="h-4 w-4" /> API Key</div>
            {activeKey ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-slate-300 font-mono bg-black/30 rounded-lg px-3 py-2 truncate">{activeKey.key}</code>
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(activeKey.key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline" onClick={generateKey} disabled={busy === 'key'}
                  className="h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/5">
                  {busy === 'key' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Regenerate
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">No API key yet. Generate one to start using the API.</p>
                <Button size="sm" onClick={generateKey} disabled={busy === 'key'} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300">
                  {busy === 'key' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 mr-1.5" />} Generate key
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Pass this key in the <code className="text-slate-400">x-api-key</code> header when calling <code className="text-slate-400">/inquire</code>.</p>
          </div>

          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-5 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm text-rose-300 mb-1"><Trash2 className="h-4 w-4" /> Danger zone</div>
            <p className="text-xs text-slate-500 mb-3">Permanently delete your account, subscription, and API keys. This cannot be undone.</p>
            <Button size="sm" variant="outline" onClick={() => setDelStep(1)} className="h-8 border-rose-400/40 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete account
            </Button>

            <AlertDialog open={delStep === 1} onOpenChange={(o) => setDelStep(o ? 1 : 0)}>
              <AlertDialogContent className="bg-[#0B0F16] border-white/10 text-slate-200">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete account?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    This will permanently remove your <span className="text-rose-300">subscriptions</span>, <span className="text-rose-300">API keys</span>, and <span className="text-rose-300">audit logs</span>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <Button variant="outline" onClick={() => setDelStep(0)} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5">Cancel</Button>
                  <Button onClick={() => setDelStep(2)} className="bg-rose-500 text-white hover:bg-rose-600 border-rose-500">Continue</Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={delStep === 2} onOpenChange={(o) => setDelStep(o ? 2 : 0)}>
              <AlertDialogContent className="bg-[#0B0F16] border-white/10 text-slate-200">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    This is your final warning. Your session and tokens will be cleared immediately and you will be signed out.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <Button variant="outline" onClick={() => setDelStep(0)} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5">Cancel</Button>
                  <Button onClick={performDeletion} disabled={delBusy} className="bg-rose-600 text-white hover:bg-rose-700 border-rose-600">
                    {delBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Delete permanently
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      {msg && <div className="mt-4 text-sm text-amber-300">{msg}</div>}
    </AppShell>
  );
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className="text-slate-200">{value}</span></div>;
}