import React, { useEffect, useState } from 'react';
import { ShieldCheck, ArrowRight, Loader2, Check, KeyRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import MobileBackHeader from '@/components/sf2x/MobileBackHeader';
import { base44 } from '@/api/base44Client';
import TierBadge from '@/components/sf2x/TierBadge';
import PublicNav from '@/components/sf2x/PublicNav';

// Credit-metered pricing with asymmetric routing. Every verification is a
// full tribunal: mid-tier proposers write the answer, then best-AI (Claude
// Opus 4.8 / GPT-4o) verifies and falsifies it — so every lie is caught by a
// top-tier model regardless of which tier you're on. Plans bundle a monthly
// credit allowance; BYOK customers bring their own provider key so their LLM
// spend stays with them and Aether's marginal cost is ~zero.
// See apiAuth.js PLAN_QUOTAS + CREDIT_COSTS for the live metering.
const CREDIT_BLURB = 'Every verification is a full tribunal — best-AI on every catch, mid-tier on every write. 1 credit ≈ a gate check (free) · a tribunal is 10.';

const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, free: true,
    blurb: 'Try the truth layer. No sign-in required.',
    features: ['5 verifications / day (abuse guard)', 'No sign-in required', 'Full tribunal + red-team', 'Signed warrants', 'Community support'],
  },
  {
    id: 'starter', name: 'Starter', price: 20,
    blurb: 'For regular use. Full tribunal with best-AI verification, credit-metered.',
    features: ['250 credits / mo', 'Full tribunal + red-team', 'Best-AI verifier + falsifier', 'Signed warrants', 'Community support', '1 seat'],
  },
  {
    id: 'pro', name: 'Pro', price: 100, popular: true,
    blurb: 'For teams shipping AI. Full tribunal, warrants, correction tracking.',
    features: ['1,000 credits / mo', 'Full 3-way tribunal + red-team', 'Best-AI verifier + cross-firm falsifier', 'Warrants + correction tracking', 'Drift monitoring', 'Email support', '5 seats'],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 1999,
    blurb: "For organizations that can't afford hallucinations. Full tribunal, evidence packs, audit trail, SLA.",
    features: ['15,000 credits / mo', 'Full 3-way tribunal + red-team loop', 'Best-AI verifier + cross-firm falsifier', 'Signed warrants + evidence packs', 'Regulator-ready audit trail', 'Custom benchmarks', 'Tribunal lift audits', 'Priority support', 'Dedicated SLA', '25 seats'],
  },
  {
    id: 'byok', name: 'Enterprise BYOK', price: 999, byok: true,
    blurb: 'Bring your own provider key (OpenRouter / Anthropic / Google). Full tribunal, near-unlimited, and your LLM spend stays with you — Aether only charges for the orchestration, warrants, and governance.',
    features: ['Bring your own API key', 'Full 3-way tribunal + evidence packs', 'Best-AI verifier + cross-firm falsifier', 'Fair-use credits (~200k / mo)', 'Signed warrants + audit trail', 'Dedicated SLA', '25 seats'],
  },
  {
    id: 'scale', name: 'Scale', price: 9999,
    blurb: 'For platforms with millions of AI interactions. Dedicated infrastructure, on-premise, white-glove onboarding.',
    features: ['150,000 credits / mo', 'On-premise / VPC deployment', 'Best-AI verifier + cross-firm falsifier', 'Signed warrants + evidence packs', 'Dedicated compliance onboarding', 'Dedicated infrastructure', 'Custom integrations', 'White-glove onboarding', 'Dedicated SLA', '100 seats'],
  },
];

const API_PLANS = [
  { id: 'api-access', name: 'API Starter', price: 49, api: true, blurb: 'For apps wiring in verification. 10,000 credits/mo (~5,000 verifications).', features: ['10,000 credits / mo', '~5,000 verifications', '/verify + /batch endpoints', 'Usage dashboard', 'Email support'] },
  { id: 'api-access-pro', name: 'API Pro', price: 199, api: true, blurb: 'For platforms with real volume. 50,000 credits/mo + priority routing.', features: ['50,000 credits / mo', '~25,000 verifications', '/verify + /tribunal + /batch', 'Priority routing', 'Usage + drift dashboard', 'Priority support'] },
];

export default function Pricing() {
  const [loading, setLoading] = useState(null);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [authed, setAuthed] = useState(true);
  const [params] = useSearchParams();

  useEffect(() => { base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false)); }, []);

  async function subscribe(plan) {
    setErr(null);
    if (plan.free) return; // free tier handled by the <Link> in render, not here
    if (plan.api && !authed) { setErr('Sign in first so your API key and monthly quota attach to your account.'); return; }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr('Enter your email to start checkout.');
      return;
    }
    try {
      if (window.self !== window.top) { setErr('Open the published app (not the builder preview) to complete checkout.'); return; }
      setLoading(plan.id);
      const res = await base44.functions.invoke('createCheckout', { plan: plan.id, customer_email: email.trim() });
      const url = res?.data?.url || res?.url;
      if (url) window.location.href = url;
      else if (res?.data?.free) setErr('This plan is free — no checkout needed.');
      else setErr(res?.data?.error || res?.error || 'Could not start checkout.');
    } catch (e) {
      setErr(e?.message || 'Checkout failed.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">

        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">Pricing</h1>
          <p className="mt-3 text-sm text-slate-400 max-w-xl mx-auto">The trust layer for AI. Every verification is a full tribunal — best-AI catches every lie, mid-tier writes every answer. Buy credits, spend them on the truth.</p>
        </div>

        {params.get('status') === 'success' && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3 text-center text-sm text-emerald-200">
            Subscription active — check your email for your API key.
          </div>
        )}

        {/* Email input — shared across paid tiers (public app, no login) */}
        <div className="mx-auto max-w-md mb-8">
          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Your email (for checkout)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full h-11 rounded-lg bg-white/[0.02] border border-white/10 px-3 text-sm text-foreground placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
          />
        </div>

        {err && <div className="mb-6 text-center text-sm text-rose-300">{err}</div>}

        {/* Compliance / audit-proof callout — why enterprises pay */}
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-400/[0.06] to-transparent p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <ShieldCheck className="h-3.5 w-3.5" /> Built for the person who gets fired
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground tracking-tight">A dashboard is opinion. A warrant is evidence.</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl leading-relaxed">
            Other tools report your hallucination rate. Aether hands you a cryptographically signed, source-snapshotted warrant for every verified answer — so when a regulator or auditor asks "what did your AI say and why," you can prove it. Evidence packs export in one click.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((p) => (
            <div key={p.id} className={`rounded-2xl border bg-card p-6 flex flex-col relative ${p.popular ? 'border-emerald-400/40 ring-1 ring-emerald-400/20' : p.byok ? 'border-violet-400/40 ring-1 ring-violet-400/20' : 'border-white/10'}`}>
              {p.popular && <span className="absolute -top-2.5 left-6 text-[10px] uppercase tracking-[0.16em] bg-emerald-400 text-[#070A0F] px-2 py-0.5 rounded-full">Most popular</span>}
              {p.byok && <span className="absolute -top-2.5 left-6 text-[10px] uppercase tracking-[0.16em] bg-violet-400 text-[#070A0F] px-2 py-0.5 rounded-full">Bring your own key</span>}
              <TierBadge tier={p.byok ? 'enterprise' : p.id} />
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-foreground">${p.price}</span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
              <p className="mt-2 text-sm text-slate-400 min-h-[40px]">{p.blurb}</p>
              <ul className="mt-4 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              {p.free ? (
                <Link to="/register" className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5">
                  Get started — Free <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={() => subscribe(p)}
                  disabled={loading === p.id}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2.5 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50"
                >
                  {loading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get Started <ArrowRight className="h-4 w-4" /></>}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500 max-w-xl mx-auto">
          {CREDIT_BLURB} Free keeps a 5/day abuse guard. Run out of credits? Buy a top-up or upgrade — the depth you bought keeps working.
        </p>

        {/* Developer API access — self-serve tiers */}
        <div className="mt-14">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-4 w-4 text-emerald-300" />
            <h2 className="font-heading text-xl font-semibold text-foreground tracking-tight">Developer API Access</h2>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl mb-5">Call <code className="text-slate-300">/verify</code>, <code className="text-slate-300">/tribunal</code>, and <code className="text-slate-300">/batch</code> from your code. Buy a tier, generate a key in the dashboard, and ship. {!authed && <span className="text-amber-300">Sign in first so your key + quota attach to your account.</span>}</p>
          <div className="grid sm:grid-cols-2 gap-5 max-w-3xl">
            {API_PLANS.map((p) => (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-card p-6 flex flex-col">
                <TierBadge tier="pro" />
                <div className="mt-3 flex items-baseline gap-1"><span className="text-3xl font-semibold text-foreground">${p.price}</span><span className="text-sm text-slate-500">/mo</span></div>
                <p className="mt-2 text-sm text-slate-400">{p.blurb}</p>
                <ul className="mt-4 space-y-2 flex-1">
                  {p.features.map((f) => (<li key={f} className="flex items-start gap-2 text-[13px] text-slate-300"><Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> {f}</li>))}
                </ul>
                {authed ? (
                  <button onClick={() => subscribe(p)} disabled={loading === p.id} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 py-2.5 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50">
                    {loading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get API access <ArrowRight className="h-4 w-4" /></>}
                  </button>
                ) : (
                  <Link to="/login" className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5">Sign in to buy <ArrowRight className="h-4 w-4" /></Link>
                )}
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-12 pt-6 border-t border-white/5 text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Aether · The Truth Layer for AI · Test mode — use card 4242 4242 4242 4242</span>
          <span className="mx-1">·</span>
          <Link to="/terms" className="hover:text-slate-300">Terms</Link>
          <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}