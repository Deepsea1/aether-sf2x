import React, { useState } from 'react';
import { Plug, KeyRound, ShieldCheck, Wrench, Copy, Check, Terminal, ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import AgentGreeter from '@/components/sf2x/AgentGreeter';

// Public docs page for the Aether MCP server — the thin Cloudflare Worker that
// lets Claude (and any MCP client) call Aether's real verification engine.

const TOOLS = [
  {
    name: 'verify_claim',
    icon: ShieldCheck,
    desc: 'Verify an AI-generated answer for hallucinations. Runs the full tribunal (proposer/critic/verifier + red-team), returns a calibrated trust score, verdict, and a cryptographically signed warrant persisted to Base44.',
    input: `{ "text": "<AI response>", "domain": "Medicine", "sources": [{ "url": "https://..." }] }`,
    output: `{ "verification_id": "...", "warrant_id": "...", "verdict": "contested", "trust_score": 62, "certified": true, "warrant_signed": true }`,
  },
  {
    name: 'explain_verdict',
    icon: FileText,
    desc: 'Explain a prior verification decision. Returns the verdict, trust score, and certification status for a given verification id.',
    input: `{ "verification_id": "<id from verify_claim>" }`,
    output: `{ "verification_id": "...", "verdict": "contested", "trust_score": 62, "certified": true, "certification": "certified" }`,
  },
  {
    name: 'get_warrant',
    icon: KeyRound,
    desc: 'Retrieve the full signed warrant — the durable proof artifact with premises, signature, and expiry.',
    input: `{ "verification_id": "<id from verify_claim>" }`,
    output: `{ "warrant_id": "...", "signed_hash": "...", "premises": [...], "sources": [...], "certified": true }`,
  },
];

const DEPLOY_STEPS = [
  { n: 1, title: 'Copy the Worker files', body: 'Grab the four files in src/mcp-worker/ (worker.js, wrangler.toml, package.json, README.md) into a new GitHub repo.' },
  { n: 2, title: 'Create the KV namespace', body: 'npx wrangler kv namespace create WARRANTS — paste the printed id into wrangler.toml.' },
  { n: 3, title: 'Set the warrantApi URL', body: 'In wrangler.toml, set AETHER_WARRANT_API_URL to your Base44 warrantApi endpoint.' },
  { n: 4, title: 'Set the two secrets', body: 'npx wrangler secret put AETHER_API_KEY (your SF2X_API_KEY) and npx wrangler secret put AETHER_MCP_TOKEN (a long random string).' },
  { n: 5, title: 'Deploy', body: 'npx wrangler deploy — you get a public URL like https://aether-mcp.<your-subdomain>.workers.dev.' },
];

export default function McpServer() {
  const [workerUrl, setWorkerUrl] = useState('https://aether-mcp.YOUR-SUBDOMAIN.workers.dev');
  const [token, setToken] = useState('YOUR_AETHER_MCP_TOKEN');
  const [copied, setCopied] = useState(null);

  const cleanUrl = workerUrl.replace(/\/$/, '');

  const claudeConfig = JSON.stringify({
    mcpServers: {
      aether: {
        url: cleanUrl,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);

  const curlTest = `curl -X POST ${cleanUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  function copy(key, text) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">

        {/* Hero */}
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 mb-8">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/80 mb-3">
            <Plug className="h-3.5 w-3.5" /> Aether MCP Server
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Connect Claude to the truth layer.</h1>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-2xl">
            A thin MCP server (one Cloudflare Worker) exposes Aether's real verification engine to Claude Desktop, ChatGPT, and any MCP client. Paste an AI answer, get a signed, trust-scored warrant — no regex, no in-memory state, the attestation key never leaves Base44.
          </p>
          <div className="mt-3"><AgentGreeter
            agentKey="integration_support"
            to="/integration-support"
            firstGreeting="Hi! I'm your Integration Support assistant. I can help you deploy the MCP server, connect Claude, or debug a tool call. Click below and ask me anything."
            returningGreeting="Need help with the MCP server? I'm here."
            label="Ask integration support"
          /></div>
        </div>

        {/* How it works */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Wrench className="h-4 w-4 text-emerald-400" /> How it works</h2>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-8 text-sm text-slate-400 leading-relaxed space-y-2">
          <p>The Worker is a <span className="text-slate-200">transport only</span>. When Claude calls <code className="text-slate-200">verify_claim</code>, the Worker forwards it to your Base44 <code className="text-slate-200">warrantApi</code> function, which:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>decomposes the text into atomic claims,</li>
            <li>runs the proposer / critic / verifier tribunal + red-team,</li>
            <li><span className="text-slate-200">signs the warrant</span> with <code className="text-slate-200">sf2x_attestation_key</code> (the secret stays in Base44),</li>
            <li><span className="text-slate-200">persists it to the Warrant entity</span> (durable, restart-safe),</li>
            <li>returns <code className="text-slate-200">warrant_id</code> + <code className="text-slate-200">lineage_id</code> + the signed warrant.</li>
          </ul>
          <p className="text-slate-500 text-xs pt-1">A KV cache lets <code>explain_verdict</code> / <code>get_warrant</code> retrieve prior decisions without a second tribunal run. Quota is enforced upstream by warrantApi per API key.</p>
        </div>

        {/* Tools */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" /> MCP tools</h2>
        <div className="space-y-4 mb-8">
          {TOOLS.map((t) => (
            <div key={t.name} className="rounded-2xl border border-white/10 bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <t.icon className="h-4 w-4 text-emerald-400" />
                <span className="font-mono text-sm text-foreground font-medium">{t.name}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{t.desc}</p>
              <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Input</div>
              <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 mb-2 overflow-x-auto">{t.input}</pre>
              <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Output</div>
              <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto">{t.output}</pre>
            </div>
          ))}
        </div>

        {/* Deploy steps */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Wrench className="h-4 w-4 text-emerald-400" /> Deploy (5 steps)</h2>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-8 space-y-3">
          {DEPLOY_STEPS.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="shrink-0 h-6 w-6 rounded-full bg-emerald-400/15 text-emerald-300 text-xs font-semibold flex items-center justify-center">{s.n}</div>
              <div>
                <div className="text-sm text-foreground font-medium">{s.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed mt-0.5">{s.body}</div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-600 pt-2 border-t border-white/5">Full instructions in <code className="text-slate-400">src/mcp-worker/README.md</code>.</p>
        </div>

        {/* Connect config generator */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Plug className="h-4 w-4 text-emerald-400" /> Connect Claude</h2>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-8">
          <p className="text-xs text-slate-500 mb-4">Paste your deployed Worker URL + token below. The Claude Desktop config and test command update automatically.</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-600">Worker URL</label>
              <input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-400/40" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-600">MCP token</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-400/40" />
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-600">claude_desktop_config.json</span>
            <button onClick={() => copy('config', claudeConfig)} className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200">
              {copied === 'config' ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto">{claudeConfig}</pre>

          <div className="flex items-center justify-between mb-1 mt-4">
            <span className="text-[11px] uppercase tracking-wider text-slate-600">test (tools/list)</span>
            <button onClick={() => copy('curl', curlTest)} className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200">
              {copied === 'curl' ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <pre className="text-xs text-slate-300 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{curlTest}</pre>
        </div>

        {/* Security */}
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Security</h2>
        <div className="rounded-2xl border border-white/10 bg-card p-5 mb-8 text-xs text-slate-400 leading-relaxed space-y-1.5">
          <p>• <span className="text-slate-200">Bearer-token auth</span> on the Worker (your <code className="text-slate-200">AETHER_MCP_TOKEN</code>); the Aether API key is a separate server-side secret.</p>
          <p>• <span className="text-slate-200">SSRF guard</span> rejects non-http(s) and private/internal source URLs before they reach the verifier.</p>
          <p>• The <span className="text-slate-200">attestation key never leaves Base44</span> — signing happens inside the warrantApi function, not the Worker.</p>
          <p>• Quota + rate limits are enforced upstream by warrantApi per API key.</p>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5 mb-8">
          <div className="text-sm text-slate-200 font-medium mb-1">Get an API key</div>
          <p className="text-xs text-slate-400 leading-relaxed">The Worker calls warrantApi with your Aether API key. Generate one in the <Link to="/portal" className="text-emerald-300 underline-offset-2 hover:underline">Portal</Link>, then set it as <code className="text-slate-300">AETHER_API_KEY</code> in the Worker.</p>
          <Link to="/api-docs" className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200">See the REST API docs <ArrowRight className="h-3 w-3" /></Link>
        </div>

        <footer className="mt-12 pt-6 border-t border-white/5 text-[11px] text-slate-600">Aether · The Truth Layer for AI · every AI response verified, scored, and warrant-backed.</footer>
      </div>
    </div>
  );
}