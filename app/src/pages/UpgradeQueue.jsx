import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Mail, Send, Users, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';

const PLANS = [
  { id: 'starter', name: 'Forge (Starter)', price: { monthly: 5, yearly: 50 } },
  { id: 'pro', name: 'Prime (Pro)', price: { monthly: 30, yearly: 300 } },
];

function Stat({ icon, label, value, tone }) {
  const tones = {
    emerald: 'text-emerald-300 bg-emerald-400/10',
    amber: 'text-amber-300 bg-amber-400/10',
    slate: 'text-slate-300 bg-white/[0.04]',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <div>
          <div className="text-2xl font-semibold text-white leading-none">{value}</div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'active' || status === 'trialing') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full">Paid</span>;
  }
  if (status === 'past_due' || status === 'canceled') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full">{status === 'past_due' ? 'Past due' : 'Canceled'}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[11px] text-rose-300 bg-rose-400/10 px-2 py-0.5 rounded-full">No plan</span>;
}

export default function UpgradeQueue() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [plan, setPlan] = useState('pro');
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    (async () => {
      try {
        const [u, s] = await Promise.all([
          base44.entities.User.list(),
          base44.entities.Subscription.list(),
        ]);
        setUsers(u || []);
        setSubs(s || []);
      } catch (e) {
        toast({ title: 'Failed to load users', description: e?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subByUser = useMemo(() => {
    const m = {};
    (subs || []).forEach((s) => { if (s.user_id) m[s.user_id] = s; });
    return m;
  }, [subs]);

  const unpaid = useMemo(
    () => users.filter((u) => {
      const s = subByUser[u.id];
      return !s || (s.status !== 'active' && s.status !== 'trialing');
    }),
    [users, subByUser]
  );

  const paidCount = users.length - unpaid.length;

  async function sendOne(user) {
    setSending(user.id);
    try {
      const res = await base44.functions.invoke('sendUpgradeEmail', { user_id: user.id, plan, billing });
      toast({ title: 'Upgrade link sent', description: res?.data?.email || user.email });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('cooldown')) {
        toast({ title: 'On cooldown', description: 'A link was already sent to this user in the last 24h.' });
      } else {
        toast({ title: 'Failed to send', description: msg || 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setSending(null);
    }
  }

  async function sendAll() {
    if (!unpaid.length) return;
    setSending('all');
    let ok = 0;
    let fail = 0;
    let cooldown = 0;
    for (const u of unpaid) {
      try {
        await base44.functions.invoke('sendUpgradeEmail', { user_id: u.id, plan, billing });
        ok++;
      } catch (e) {
        if (String(e?.message || e).toLowerCase().includes('cooldown')) cooldown++;
        else fail++;
      }
    }
    setSending(null);
    const note = [fail ? `${fail} failed` : '', cooldown ? `${cooldown} on cooldown` : ''].filter(Boolean).join(' · ');
    toast({
      title: `Sent to ${ok} user${ok === 1 ? '' : 's'}`,
      description: note || 'All checkout links delivered.',
      variant: fail ? 'destructive' : 'default',
    });
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white tracking-tight">Upgrade Queue</h1>
          <p className="text-sm text-slate-400 mt-1">Registered users without an active subscription — email them a checkout link to upgrade.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Stat icon={<Users className="h-4 w-4" />} label="Registered users" value={users.length} tone="slate" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Paid" value={paidCount} tone="emerald" />
        <Stat icon={<AlertTriangle className="h-4 w-4" />} label="Unpaid" value={unpaid.length} tone="amber" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Plan</span>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlan(p.id)}
                    className={`px-3 py-1.5 text-xs ${plan === p.id ? 'bg-emerald-400 text-[#070A0F]' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Billing</span>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                <button onClick={() => setBilling('monthly')} className={`px-3 py-1.5 text-xs ${billing === 'monthly' ? 'bg-emerald-400 text-[#070A0F]' : 'text-slate-300 hover:bg-white/5'}`}>Monthly</button>
                <button onClick={() => setBilling('yearly')} className={`px-3 py-1.5 text-xs ${billing === 'yearly' ? 'bg-emerald-400 text-[#070A0F]' : 'text-slate-300 hover:bg-white/5'}`}>Yearly</button>
              </div>
            </div>
          </div>
          <button
            onClick={sendAll}
            disabled={!unpaid.length || sending === 'all'}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50"
          >
            {sending === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email all unpaid ({unpaid.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-slate-500 border-b border-white/5">
            <div className="col-span-4">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          {unpaid.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">All registered users have an active subscription. 🎉</div>
          ) : (
            unpaid.map((u) => (
              <div key={u.id} className="grid grid-cols-12 px-4 py-3 items-center border-b border-white/5 text-sm hover:bg-white/[0.02]">
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-xs text-slate-300 shrink-0">
                    {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-slate-200 truncate">{u.full_name || '—'}</span>
                </div>
                <div className="col-span-3 text-slate-400 truncate">{u.email || '—'}</div>
                <div className="col-span-2 text-slate-400">{u.role || 'user'}</div>
                <div className="col-span-2"><StatusBadge status={subByUser[u.id]?.status} /></div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => sendOne(u)}
                    disabled={sending === u.id || sending === 'all'}
                    title="Send upgrade checkout link"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    {sending === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Send
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </AppShell>
  );
}