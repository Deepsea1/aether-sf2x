import React, { useState } from 'react';
import { Code2, Copy, Check, ShieldCheck, Terminal, FileSpreadsheet, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/sf2x/AppShell';

function CodeBlock({ name, code, lang }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-slate-300">{name}</span>
        <button onClick={copy} className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">{copied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}</button>
      </div>
      <pre className="text-[11px] font-mono text-slate-300 bg-black/50 border border-white/5 rounded-lg p-3 overflow-x-auto max-h-80 overflow-y-auto">{code}</pre>
    </div>
  );
}

export default function Sdk() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><Code2 className="h-3.5 w-3.5" /> SDKs</div>
          <h1 className="font-heading text-xl font-semibold text-white">Aether in your stack</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">Drop the trust layer into your codebase. Official Python and TypeScript SDKs with typed responses — plus a white-label React component to embed Verify into your own AI product.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Feature icon={Terminal} title="Python" desc="aether.py — requests-based, sync + streaming." />
          <Feature icon={Boxes} title="TypeScript" desc="aether.ts — fetch-based, typed, async generators." />
          <Feature icon={ShieldCheck} title="React" desc="<AetherVerify /> — drop-in verify button, white-label." />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white mb-1">Python — aether.py</div>
          <p className="text-[11px] text-slate-500 mb-3">Copy this into your project, or download from <code className="text-slate-400">/sdks/aether.py</code>.</p>
          <CodeBlock name="aether.py" code={PY} />
          <CodeBlock name="quickstart.py" code={`from aether import Aether
a = Aether("sk_sf2x_...", "https://your-app.base44.app")
v = a.verify("Vitamin C prevents the common cold.", domain="Medicine")
print(v["trust_score"], v["verdict"], v["corrections"])
# stream
for ev in a.verify_stream("Daily aspirin is safe for everyone."):
    print(ev["stage"], ev.get("claim") or ev.get("verdict"))`} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white mb-1">TypeScript — aether.ts</div>
          <p className="text-[11px] text-slate-500 mb-3">Copy this into your project, or download from <code className="text-slate-400">/sdks/aether.ts</code>.</p>
          <CodeBlock name="aether.ts" code={TS} />
          <CodeBlock name="quickstart.ts" code={`import { Aether } from "./aether";
const a = new Aether("sk_sf2x_...", "https://your-app.base44.app");
const v = await a.verify("Vitamin C prevents the common cold.", "Medicine");
console.log(v.trust_score, v.verdict, v.corrections);
for await (const ev of a.verifyStream("Daily aspirin is safe.")) console.log(ev.stage);`} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="text-sm font-medium text-white mb-1">White-label React component</div>
          <p className="text-[11px] text-slate-500 mb-3">Drop this into your AI product. Renders a "Verify with Aether" button (your branding) that shows an inline verdict card. Configure with your API key and origin.</p>
          <CodeBlock name="AetherVerify.jsx" code={REACT} />
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-200">Full endpoint reference →</div>
          <Link to="/api-docs" className="text-xs text-emerald-300 hover:text-emerald-200">Read the API docs</Link>
        </div>
      </div>
    </AppShell>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <Icon className="h-5 w-5 text-emerald-400 mb-2" />
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{desc}</div>
    </div>
  );
}

const PY = `import requests

class Aether:
    def __init__(self, api_key, origin="https://your-app.base44.app"):
        self.api_key = api_key
        self.origin = origin.rstrip("/")
    def _h(self): return {"x-api-key": self.api_key, "Content-Type": "application/json"}
    def verify(self, text, domain="General", source="python-sdk", grounding_doc_ids=None):
        body = {"text": text, "domain": domain, "source": source}
        if grounding_doc_ids: body["grounding_doc_ids"] = grounding_doc_ids
        r = requests.post(f"{self.origin}/functions/verifyResponse", json=body, headers=self._h(), timeout=60)
        r.raise_for_status(); return r.json()
    def verify_stream(self, text, domain="General"):
        import json
        with requests.post(f"{self.origin}/functions/streamVerify", json={"text": text, "domain": domain},
                            headers=self._h(), stream=True, timeout=120) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if line and line.startswith(b"data: "): yield json.loads(line[6:])
    def tribunal(self, prompt, domain="General", stakes="medium"):
        r = requests.post(f"{self.origin}/functions/inquireTribunal", json={"prompt": prompt, "domain": domain, "stakes": stakes}, headers=self._h(), timeout=180)
        r.raise_for_status(); return r.json()
    def batch(self, items):
        r = requests.post(f"{self.origin}/functions/verifyBatch", json={"items": items}, headers=self._h(), timeout=120)
        r.raise_for_status(); return r.json()
    def benchmark(self):
        r = requests.get(f"{self.origin}/entities/BenchResult", params={"sort": "-bench_score", "limit": 20}, timeout=30)
        r.raise_for_status(); return r.json()`;

const TS = `export class Aether {
  constructor(private apiKey: string, private origin = "https://your-app.base44.app") {}
  private h() { return { "x-api-key": this.apiKey, "Content-Type": "application/json" }; }
  async verify(text: string, domain = "General", source = "ts-sdk", groundingDocIds?: string[]) {
    const body: any = { text, domain, source }; if (groundingDocIds) body.grounding_doc_ids = groundingDocIds;
    const r = await fetch(\`\${this.origin}/functions/verifyResponse\`, { method: "POST", headers: this.h(), body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
  }
  async *verifyStream(text: string, domain = "General") {
    const r = await fetch(\`\${this.origin}/functions/streamVerify\`, { method: "POST", headers: this.h(), body: JSON.stringify({ text, domain }) });
    const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const parts = buf.split("\\n\\n"); buf = parts.pop() || "";
      for (const p of parts) if (p.startsWith("data: ")) yield JSON.parse(p.slice(6)); }
  }
  async tribunal(prompt: string, domain = "General", stakes: any = "medium") {
    const r = await fetch(\`\${this.origin}/functions/inquireTribunal\`, { method: "POST", headers: this.h(), body: JSON.stringify({ prompt, domain, stakes }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
  }
}`;

const REACT = `// AetherVerify.jsx — white-label drop-in verify button.
// Usage: <AetherVerify apiKey="sk_..." origin="https://your-app.base44.app" text={aiResponse} brand="Acme" />
import React, { useState } from "react";

export function AetherVerify({ text, apiKey, origin, brand = "Aether", groundingDocIds }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const tone = (t) => t >= 75 ? "#34d399" : t >= 50 ? "#fbbf24" : "#fb7185";
  const label = (v) => v === "verified" ? "Verified" : v === "contested" ? "Contested" : "Rejected";

  async function verify() {
    setState("loading");
    try {
      const body = { text, source: "react-widget" };
      if (groundingDocIds) body.grounding_doc_ids = groundingDocIds;
      const r = await fetch(\`\${origin}/functions/verifyResponse\`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d); setState("done");
    } catch (e) { setResult({ error: e.message }); setState("error"); }
  }

  if (state === "done" && result) {
    const t = result.trust_score;
    return (
      <div style={{ fontFamily: "system-ui", marginTop: 8, padding: "12px 14px", background: "#0B0F16", color: "#e2e8f0", border: "1px solid #1f2937", borderRadius: 12, maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>✓ {label(result.verdict)}</span>
          <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 700, color: tone(t) }}>{t}<span style={{ fontSize: 12, color: "#64748b" }}>/100</span></span>
        </div>
        {result.corrections?.length > 0 && (
          <ul style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1f2937" }}>
            {result.corrections.slice(0, 3).map((c, i) => <li key={i} style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>• {c}</li>)}
          </ul>
        )}
        <a href={origin + (result.tribunal_url || "")} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#34d399", textDecoration: "none" }}>View tribunal →</a>
      </div>
    );
  }
  return (
    <button onClick={verify} disabled={state === "loading" || !text}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "4px 10px", fontSize: 12,
        color: "#070A0F", background: "linear-gradient(135deg,#34d399,#0d9488)", border: 0, borderRadius: 7, cursor: "pointer" }}>
      {state === "loading" ? "Tribunal running..." : \`✓ Verify with \${brand}\`}
    </button>
  );
}`;