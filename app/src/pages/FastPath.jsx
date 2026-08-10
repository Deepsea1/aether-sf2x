import React, { useState } from 'react';
import { Zap, Clock, Check, X, Terminal, Copy } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const SAMPLES = [
  { text: 'The Eiffel Tower is located in Paris, France.', expected: 'safe', trust: 92 },
  { text: 'Penicillin was discovered by Alexander Fleming in 1928.', expected: 'safe', trust: 88 },
  { text: 'The Great Wall of China is visible from the moon with the naked eye.', expected: 'hallucination', trust: 12 },
  { text: 'Humans only use 10% of their brain capacity.', expected: 'hallucination', trust: 8 },
  { text: 'Water boils at 100°C at sea level pressure.', expected: 'safe', trust: 95 },
];

const SDK_SAMPLE = `import { Aether } from '@aether/sdk';

const aether = new Aether({ apiKey: 'sk_aether_...' });

// Inline fast-path: sub-200ms verdict on any text
const result = await aether.fastPath.check({
  text: "The Great Wall of China is visible from the moon.",
  domain: "General",
});

console.log(result.verdict);  // "hallucination"
console.log(result.trust);    // 12
console.log(result.latency_ms); // 187`;

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-white/10 bg-[#070A0F] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-xs font-mono text-slate-500">aether-fastpath.ts</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs text-slate-300 font-mono leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export default function FastPath() {
  const [selected, setSelected] = useState(null);
  const [checking, setChecking] = useState(false);
  const [latency, setLatency] = useState(null);

  const check = (sample) => {
    setChecking(true);
    setSelected(null);
    setLatency(null);
    const t0 = performance.now();
    // Simulate sub-200ms fast-path detection
    setTimeout(() => {
      setLatency(Math.round(performance.now() - t0));
      setSelected(sample);
      setChecking(false);
    }, 120 + Math.random() * 60);
  };

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <Zap className="h-3.5 w-3.5" /> Inline Detection
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Fast-Path Detector</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Sub-200ms instant hallucination flagging — before the full tribunal runs. Luna-style real-time feedback.
          </p>
        </div>

        {/* Live demo */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6 mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Live Demo</h2>
            <span className="ml-auto text-xs text-slate-500">Click a claim to check</span>
          </div>
          <div className="space-y-2 mb-4">
            {SAMPLES.map((s, i) => (
              <button
                key={i}
                onClick={() => check(s)}
                disabled={checking}
                className="w-full text-left rounded-lg border border-white/10 bg-[#070A0F] px-4 py-3 text-sm text-slate-300 hover:border-emerald-400/30 transition-colors disabled:opacity-50"
              >
                {s.text}
              </button>
            ))}
          </div>
          {checking && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="h-4 w-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              Checking...
            </div>
          )}
          {selected && !checking && (
            <div className={`rounded-lg border p-4 ${selected.expected === 'hallucination' ? 'border-rose-400/30 bg-rose-400/[0.05]' : 'border-emerald-400/30 bg-emerald-400/[0.05]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {selected.expected === 'hallucination' ? (
                    <><X className="h-5 w-5 text-rose-400" /><span className="text-sm font-semibold text-rose-300">Hallucination Detected</span></>
                  ) : (
                    <><Check className="h-5 w-5 text-emerald-400" /><span className="text-sm font-semibold text-emerald-300">Likely Safe</span></>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>trust {selected.trust}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {latency}ms</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {selected.expected === 'hallucination'
                  ? 'Fast-path flagged this claim as high-risk. A full tribunal verification is recommended.'
                  : 'Fast-path passed. For high-stakes use, run a full tribunal warrant.'}
              </p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { step: '1', title: 'Lightweight Classifier', desc: 'A fast model scores the claim in <200ms — no tribunal, no source fetching.' },
            { step: '2', title: 'Risk Routing', desc: 'High-risk claims are escalated to the full tribunal. Low-risk claims pass through instantly.' },
            { step: '3', title: 'Inline Feedback', desc: 'Users see a trust indicator in real-time, before the full verification completes.' },
          ].map(s => (
            <div key={s.step} className="rounded-xl border border-white/10 bg-[#0B0F16] p-5">
              <div className="h-8 w-8 rounded-lg bg-emerald-400/10 flex items-center justify-center text-emerald-300 font-heading font-bold text-sm mb-3">{s.step}</div>
              <h3 className="text-sm font-medium text-white mb-1">{s.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* SDK */}
        <div>
          <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-3">Integration</h2>
          <CodeBlock code={SDK_SAMPLE} />
        </div>
      </div>
    </div>
  );
}