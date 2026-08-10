import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Gauge, Terminal, Loader2, ArrowRight, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import AgentGreeter from '@/components/sf2x/AgentGreeter';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import BatchVerifyTool from '@/components/sf2x/BatchVerifyTool';
import WebhookVerifyTool from '@/components/sf2x/WebhookVerifyTool';

// Public API docs for Aether — The Truth Layer for AI. Documents the three
// endpoints: POST /verify (fast verification), POST /tribunal (full debate),
// and GET /benchmark. Auth is a provisioned API key in the x-api-key header.

const TIERS = [
  { plan: 'starter', name: 'Starter', limit: '50 verifications / mo', price: '$0', best: 'Try the truth layer' },
  { plan: 'pro', name: 'Pro', limit: '25,000 / mo', price: '$399/mo', best: 'Full 3-way tribunal' },
  { plan: 'enterprise', name: 'Enterprise', limit: '250,000 / mo', price: '$1,999/mo', best: "Can't afford hallucinations" },
  { plan: 'scale', name: 'Scale', limit: 'Unlimited', price: '$9,999/mo', best: 'Millions of interactions' },
];

function CodeTabs({ examples }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 overflow-hidden">
      <div className="flex border-b border-white/5">
        {examples.map((ex, i) => (
          <button key={ex.lang} onClick={() => setTab(i)} className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${i === tab ? 'text-emerald-300 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}>{ex.lang}</button>
        ))}
      </div>
      <pre className="text-xs text-slate-300 font-mono p-3 overflow-x-auto whitespace-pre-wrap break-words">{examples[tab].code}</pre>
    </div>
  );
}

export default function ApiDocs() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.base44.app';
  const [verifyText, setVerifyText] = useState('Vitamin C prevents the common cold.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function runVerify() {
    if (!verifyText.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const res = await base44.functions.invoke('verifyResponse', { text: verifyText, source: 'api-docs' });
      const d = res?.data || res;
      if (d?.error) setErr(d.error); else setResult(d);
    } catch (e) { setErr(e?.message || 'Verification failed.'); }
    finally { setLoading(false); }
  }

  const verifyExamples = [
    { lang: 'curl', code: `curl -X POST ${origin}/functions/verifyResponse \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $AETHER_API_KEY" \\
  -d '{"text":"Vitamin C prevents the common cold.","domain":"Medicine"}'` },
    { lang: 'python', code: `import requests
r = requests.post("${origin}/functions/verifyResponse",
    headers={"x-api-key": AETHER_API_KEY},
    json={"text": "Vitamin C prevents the common cold.", "domain": "Medicine"})
print(r.json())` },
    { lang: 'javascript', code: `const res = await fetch("${origin}/functions/verifyResponse", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": AETHER_API_KEY },
  body: JSON.stringify({ text: "Vitamin C prevents the common cold.", domain: "Medicine" }),
});
const data = await res.json();` },
  ];

  const tribunalExamples = [
    { lang: 'curl', code: `curl -X POST ${origin}/functions/inquireTribunal \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $AETHER_API_KEY" \\
  -d '{"prompt":"Is daily aspirin safe?","domain":"Medicine","stakes":"medium"}'` },
    { lang: 'python', code: `import requests
r = requests.post("${origin}/functions/inquireTribunal",
    headers={"x-api-key": AETHER_API_KEY},
    json={"prompt": "Is daily aspirin safe?", "domain": "Medicine", "stakes": "medium"})
print(r.json())` },
    { lang: 'javascript', code: `const res = await fetch("${origin}/functions/inquireTribunal", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": AETHER_API_KEY },
  body: JSON.stringify({ prompt: "Is daily aspirin safe?", domain: "Medicine", stakes: "medium" }),
});
const data = await res.json();` },
  ];

  const benchmarkExamples = [
    { lang: 'curl', code: `curl ${origin}/functions/warrantApi \\
  -H "x-api-key: $AETHER_API_KEY"` },
    { lang: 'python', code: `import requests
# BenchResult list (public read)
r = requests.get("${origin}/entities/BenchResult", params={"sort":"-bench_score","limit":20})
print(r.json())` },
    { lang: 'javascript', code: `// BenchResult list — public read
const r = await fetch("${origin}/entities/BenchResult?sort=-bench_score&limit=20");
const bench = await r.json();` },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">

        {/* Hero */}
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 mb-8">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/80 mb-3">
            <Terminal className="h-3.5 w-3.5" /> Aether API
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">The truth layer for your AI.</h1>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-2xl">
            Three endpoints turn any AI response into a verified, trust-scored verdict. <span className="text-slate-200">POST /verify</span> for a fast check, <span className="text-slate-200">POST /tribunal</span> for the full proposer–critic–verifier debate, and <span className="text-slate-200">GET /benchmark</span> for the leaderboard.
          </p>
          <div className="mt-3"><AgentGreeter
            agentKey="integration_support"
            to="/integration-support"
            firstGreeting="Hi! I'm your Integration Support assistant. I can help you make your first API call, understand the endpoints, or troubleshoot. Click below and ask me anything."
            returningGreeting="I'm here if you need help with the API."
            label="Ask integration support"
          /></div>
        </div>

        {/* Auth */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-400" /> Authentication</h2>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-8">
          <p className="text-sm text-slate-400 mb-3">Every metered call carries a provisioned API key in the <code className="text-slate-200">x-api-key</code> header (Bearer-style). Generate one in the <Link to="/portal" className="text-emerald-300 underline-offset-2 hover:underline">Portal</Link>.</p>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3">x-api-key: sk_sf2x_...</pre>
        </div>

        {/* POST /verify */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> POST /verify</h2>
        <p className="text-xs text-slate-500 mb-3">Fast verification of an AI-generated text. One tribunal pass (~2-4s) decomposes claims, flags hallucinations, returns a trust score.</p>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-600 mb-2">Request</div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 mb-3">{`{ "text": "<AI response>", "domain": "Medicine", "source": "widget" }`}</pre>
          <div className="text-[11px] uppercase tracking-wider text-slate-600 mb-2">Response</div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3">{`{
  "trust_score": 42,
  "verdict": "contested",
  "corrections": ["Vitamin C does not prevent colds in the general population..."],
  "claims": [{ "claim": "...", "supported": false }],
  "warrant_id": "...",
  "tribunal_url": "/verify/<id>"
}`}</pre>
        </div>
        <CodeTabs examples={verifyExamples} />

        {/* Live verify demo */}
        <div className="rounded-2xl border border-white/10 bg-card p-5 my-6">
          <div className="text-xs text-slate-500 mb-3">Live demo — runs POST /verify. Sign in to run it for production use.</div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <Label className="text-xs text-slate-400">AI response to verify</Label>
              <Textarea value={verifyText} onChange={(e) => setVerifyText(e.target.value)} rows={3} className="text-sm mt-1" />
            </div>
            <button onClick={runVerify} disabled={loading || !verifyText.trim()} className="sm:col-span-2 mt-1 inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2 rounded-md bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40 font-medium">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : <><ShieldCheck className="h-4 w-4" /> Verify</>}
            </button>
          </div>
          {err && <div className="text-xs text-amber-300 bg-amber-400/10 rounded-md px-3 py-2 border border-amber-400/20">{err}</div>}
          {result && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Trust" value={result.trust_score} tone={result.trust_score >= 75 ? 'text-emerald-300' : result.trust_score >= 50 ? 'text-amber-300' : 'text-rose-300'} />
              <Stat label="Verdict" value={result.verdict} tone={result.verdict === 'verified' ? 'text-emerald-300' : result.verdict === 'contested' ? 'text-amber-300' : 'text-rose-300'} />
              <Stat label="Issues" value={result.corrections?.length || 0} />
              {result.tribunal_url && <Link to={result.tribunal_url} className="col-span-3 text-xs text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1">View tribunal <ArrowRight className="h-3 w-3" /></Link>}
            </div>
          )}
        </div>

        {/* POST /tribunal */}
        <h2 className="font-heading text-lg font-semibold text-foreground mt-8 mb-3 flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" /> POST /tribunal</h2>
        <p className="text-xs text-slate-500 mb-3">Full tribunal with a debate transcript. Three AIs answer, cross-examine, and a cross-firm verifier merges one hardened answer. Medium stakes runs the fast 2-model path; high runs the full 3-way.</p>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-600 mb-2">Request</div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 mb-3">{`{ "prompt": "Is daily aspirin safe?", "domain": "Medicine", "stakes": "medium" }`}</pre>
          <div className="text-[11px] uppercase tracking-wider text-slate-600 mb-2">Response</div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3">{`{
  "trustworthy_rate": 78,
  "certified": true,
  "tribunal": { "mode": "fast", "consensus": "agreed", ... },
  "version": { "answer_text": "..." },
  "warrant": { "validity_status": "valid", ... },
  "candidates": [ { "label": "Claude Opus", "trust": 82, "is_winner": true }, ... ],
  "verification_url": "/verify/<id>"
}`}</pre>
        </div>
        <CodeTabs examples={tribunalExamples} />

        {/* GET /benchmark */}
        <h2 className="font-heading text-lg font-semibold text-foreground mt-8 mb-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /> GET /benchmark</h2>
        <p className="text-xs text-slate-500 mb-3">Public benchmark data — the certified hallucination leaderboard. No auth required.</p>
        <CodeTabs examples={benchmarkExamples} />

        {/* Rate limits */}
        <h2 className="font-heading text-lg font-semibold text-foreground mt-8 mb-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /> Rate limits per tier</h2>
        <p className="text-xs text-slate-500 mb-3">Each plan grants a monthly credit pool. /verify costs 2 credits, /tribunal costs 10. Over-quota returns <code className="text-slate-300">429</code>.</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {TIERS.map((t) => (
            <div key={t.plan} className="rounded-xl border border-white/10 bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                <span className="text-sm text-emerald-300 font-semibold">{t.price}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{t.limit}</div>
              <div className="text-[11px] text-slate-600 mt-1">{t.best}</div>
            </div>
          ))}
        </div>

        {/* Batch verification + webhook setup — developer tools */}
        <h2 className="font-heading text-lg font-semibold text-foreground mt-8 mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-emerald-400" /> Developer tools</h2>
        <BatchVerifyTool />
        <WebhookVerifyTool />

        <footer className="mt-12 pt-6 border-t border-white/5 text-[11px] text-slate-600">Aether · The Truth Layer for AI · every AI response verified, scored, and warrant-backed.</footer>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-slate-100' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`text-base font-semibold ${tone}`}>{String(value)}</div>
    </div>
  );
}