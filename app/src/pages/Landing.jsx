import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Zap, Gavel, ShieldAlert, Loader2, Sparkles, Puzzle, Code2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import LiveFeed from '@/components/sf2x/LiveFeed';
import Newsletter from '@/components/sf2x/Newsletter';
import PublicNav from '@/components/sf2x/PublicNav';

const SAMPLE = 'Vitamin C prevents the common cold, and daily low-dose aspirin is safe for everyone over 40.';

function Nav() {
  return <PublicNav />;
}

function tone(t) { return t >= 75 ? 'text-emerald-300' : t >= 50 ? 'text-amber-300' : 'text-rose-300'; }
function ring(t) { return t >= 75 ? 'border-emerald-400/30 bg-emerald-400/[0.04]' : t >= 50 ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-rose-400/30 bg-rose-400/[0.04]'; }
function verdictLabel(v) { return v === 'verified' ? 'Verified' : v === 'contested' ? 'Contested' : 'Rejected'; }

export default function Landing() {
  const [text, setText] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function verify() {
    if (!text.trim() || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke('verifyResponse', { text: text.trim(), source: 'landing' });
      const d = res?.data || res;
      if (d?.error) setError(d.error); else setResult(d);
    } catch (e) { setError(e?.message || 'Verification failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 pb-20 space-y-16">
        <div className="pt-4"></div>

        {/* Hero */}
        <section className="text-center pt-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-5">
            <Sparkles className="h-3.5 w-3.5" /> The Truth Layer for AI
          </div>
          <h1 className="font-heading text-4xl sm:text-6xl font-semibold text-white tracking-tight leading-[1.05]">Don't trust. <span className="text-emerald-400">Verify.</span></h1>
          <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">Aether is the trust layer for AI. Click verify. Get a trust score. See what's real.</p>
          <p className="mt-3 text-sm text-slate-500 max-w-xl mx-auto">The button next to every AI conversation that tells you if it's true.</p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/playground" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-5 h-11 text-sm font-medium text-[#070A0F] hover:opacity-90">
              Try the Playground <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/benchmark" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 h-11 text-sm font-medium text-white hover:bg-white/5">
              View Benchmark
            </Link>
          </div>
        </section>

        {/* Live verify demo */}
        <section>
          <div className="text-center mb-6">
            <h2 className="font-heading text-xl font-semibold text-white">Try it on any AI answer</h2>
            <p className="text-sm text-slate-500 mt-1">Paste an AI response. Aether runs the tribunal and scores it.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 max-w-2xl mx-auto">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste an AI response here..." className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30 resize-none" />
            <div className="flex items-center justify-between mt-3 gap-3">
              <span className="text-[11px] text-slate-600 hidden sm:inline">One-click verify · runs the proposer–critic–verifier tribunal</span>
              <button onClick={verify} disabled={!text.trim() || loading} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 h-10 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50 ml-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {loading ? 'Tribunal running…' : 'Verify'}
              </button>
            </div>
            {error && <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">{error}</div>}
            {result && (
              <div className={`mt-4 rounded-xl border p-4 ${ring(result.trust_score)}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`text-4xl font-semibold leading-none ${tone(result.trust_score)}`}>{result.trust_score}<span className="text-lg text-slate-600">/100</span></div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${result.verdict === 'verified' ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : result.verdict === 'contested' ? 'text-amber-300 bg-amber-400/10 ring-amber-400/30' : 'text-rose-300 bg-rose-400/10 ring-rose-400/30'}`}>{verdictLabel(result.verdict)}</span>
                  </div>
                  <Link to={result.tribunal_url || '/verify'} className="text-xs text-emerald-300 hover:text-emerald-200">View tribunal →</Link>
                </div>
                {result.corrections?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-rose-300/80 mb-1.5">Issues found ({result.corrections.length})</div>
                    <ul className="space-y-1">{result.corrections.slice(0, 4).map((c, i) => (<li key={i} className="text-[12px] text-slate-400 flex gap-1.5"><span className="text-rose-400">•</span>{c}</li>))}</ul>
                  </div>
                )}
                {result.claims?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Claims checked ({result.claims.length})</div>
                    <div className="flex flex-wrap gap-1.5">{result.claims.slice(0, 10).map((c, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${c.supported ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>{c.supported ? '✓' : '✗'}</span>))}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Live activity feed */}
        <section>
          <LiveFeed />
        </section>

        {/* How it works */}
        <section>
          <div className="text-center mb-8">
            <h2 className="font-heading text-xl font-semibold text-white">One button. Every AI.</h2>
            <p className="text-sm text-slate-500 mt-1">Aether sits alongside ChatGPT, Claude, Gemini, Copilot — any LLM.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { Icon: Zap, title: 'Click verify', desc: 'A "Verify with Aether" button appears next to every AI response. One click.' },
              { Icon: Gavel, title: 'Tribunal runs', desc: 'Proposer, critic, and verifier debate the answer. Claims are checked. Hallucinations are flagged.' },
              { Icon: ShieldAlert, title: "See what's real", desc: 'A trust score, a verdict, and the specific corrections — inline, in real time.' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
                <s.Icon className="h-6 w-6 text-emerald-400 mb-3" />
                <div className="text-sm font-medium text-white">{s.title}</div>
                <div className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Built for the person who gets fired — compliance / audit-proof */}
        <section>
          <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-400/[0.06] to-transparent p-6 sm:p-8">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-3">
              <ShieldCheck className="h-3.5 w-3.5" /> Built for the person who gets fired
            </div>
            <h2 className="font-heading text-2xl font-semibold text-white tracking-tight">A dashboard is opinion. A warrant is evidence.</h2>
            <p className="mt-3 text-sm text-slate-400 max-w-2xl leading-relaxed">
              Other tools tell you your hallucination rate. Aether hands you a cryptographically signed warrant — source-snapshotted, tamper-evident, timestamped — so when a regulator, auditor, or court asks "what did your AI say and why," you can prove it.
            </p>
            <div className="mt-5 grid sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-sm font-medium text-white">Signed warrants</div>
                <div className="text-[12px] text-slate-500 mt-1">Every verified answer carries a cryptographic attestation of its grounding.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-sm font-medium text-white">Evidence packs</div>
                <div className="text-[12px] text-slate-500 mt-1">Export regulator-ready audit trails for compliance and litigation defense.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="text-sm font-medium text-white">Tamper-evident provenance</div>
                <div className="text-[12px] text-slate-500 mt-1">Source snapshots + content hashes preserve the truth even if sources rot.</div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 h-10 text-sm font-medium text-[#070A0F] hover:opacity-90">
                See Enterprise & Scale plans <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/evidence" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 h-10 text-sm font-medium text-white hover:bg-white/5">
                Explore evidence packs
              </Link>
            </div>
          </div>
        </section>

        {/* CTA cards */}
        <section className="grid sm:grid-cols-3 gap-4">
          <Link to="/extension" className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 hover:border-emerald-400/30 transition-colors">
            <Puzzle className="h-6 w-6 text-emerald-400 mb-3" />
            <div className="text-sm font-medium text-white">Browser extension</div>
            <div className="text-[13px] text-slate-500 mt-1.5">Inject the verify button on ChatGPT, Claude, Gemini & Copilot.</div>
            <div className="text-xs text-emerald-300 mt-3 inline-flex items-center gap-1">Install <ArrowRight className="h-3 w-3" /></div>
          </Link>
          <Link to="/api-docs" className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 hover:border-emerald-400/30 transition-colors">
            <Code2 className="h-6 w-6 text-emerald-400 mb-3" />
            <div className="text-sm font-medium text-white">API</div>
            <div className="text-[13px] text-slate-500 mt-1.5">POST /verify and /tribunal. curl, Python, JavaScript.</div>
            <div className="text-xs text-emerald-300 mt-3 inline-flex items-center gap-1">Read the docs <ArrowRight className="h-3 w-3" /></div>
          </Link>
          <Link to="/pricing" className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 hover:border-emerald-400/30 transition-colors">
            <ShieldCheck className="h-6 w-6 text-emerald-400 mb-3" />
            <div className="text-sm font-medium text-white">Pricing</div>
            <div className="text-[13px] text-slate-500 mt-1.5">From free to scale. Pay for verified intelligence.</div>
            <div className="text-xs text-emerald-300 mt-3 inline-flex items-center gap-1">See plans <ArrowRight className="h-3 w-3" /></div>
          </Link>
        </section>

        {/* Honest disclaimer */}
        <section>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-5 max-w-3xl mx-auto">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-[13px] text-slate-400 leading-relaxed">
                <span className="text-slate-200 font-medium">Treat our claims as promotional until proven otherwise.</span> Aether's trust scores, tribunal methodology, and benchmark results are vendor claims unless backed by independently validated technical results, real adoption, and demonstrated reliability at scale. We have published our methodology and two self-run audits — but have not yet undergone an independent third-party audit. Until then, pressure-test every claim here against the <Link to="/methodology" className="text-emerald-300 underline-offset-2 hover:underline">published limitations</Link> and external benchmarks.
              </p>
            </div>
          </div>
        </section>

        {/* Newsletter */}
        <section className="text-center">
          <Newsletter />
        </section>
      </main>
    </div>
  );
}