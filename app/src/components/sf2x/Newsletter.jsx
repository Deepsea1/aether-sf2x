import React, { useState } from 'react';
import { Mail, Loader2, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Newsletter signup — powered by the `newsletterSignup` function,
// which records the subscriber and auto-sends a welcome email.

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [err, setErr] = useState(null);

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || status === 'loading') return;
    setStatus('loading'); setErr(null);
    try {
      const res = await base44.functions.invoke('newsletterSignup', { email: email.trim(), source: 'landing' });
      const d = res?.data || res;
      if (d?.error) { setErr(d.error); setStatus('error'); return; }
      setStatus('done'); setEmail('');
    } catch (e) {
      setErr(e?.message || 'Could not subscribe.'); setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5 max-w-xl mx-auto text-center">
        <Check className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
        <div className="text-sm font-medium text-white">You're subscribed.</div>
        <div className="text-[13px] text-slate-400 mt-1">A welcome email is on its way. Watch your inbox for the Weekly AI Hallucination Report.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-1.5 justify-center">
        <Mail className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-white">Weekly AI Hallucination Report</span>
      </div>
      <p className="text-[13px] text-slate-500 text-center mb-3">The worst hallucinations caught each week, benchmark updates, and new features. No spam.</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="you@company.com"
          className="flex-1 rounded-lg bg-[#070A0F] border border-white/10 px-3 h-11 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
        />
        <button
          onClick={submit}
          disabled={status === 'loading' || !email.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 h-11 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50"
        >
          {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Subscribe
        </button>
      </div>
      {err && <div className="text-[12px] text-rose-300 mt-2 text-center">{err}</div>}
    </div>
  );
}