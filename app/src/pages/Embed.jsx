import React, { useMemo, useState } from 'react';
import { ShieldCheck, Copy, Check, ExternalLink, Code2, Puzzle } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/sf2x/AppShell';
import AgentGreeter from '@/components/sf2x/AgentGreeter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

// Public embed generator: paste an AETHER answer-version id, pick a badge style,
// and copy a self-contained <iframe> snippet for any external site.

const STYLES = [
  { key: 'full', label: 'Full receipt', w: 340, h: 240 },
  { key: 'compact', label: 'Compact', w: 240, h: 160 },
  { key: 'pill', label: 'Inline pill', w: 180, h: 40 },
  { key: 'score', label: 'Score only', w: 140, h: 120 },
];

export default function Embed() {
  const [id, setId] = useState('');
  const [style, setStyle] = useState('full');
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const current = STYLES.find((s) => s.key === style) || STYLES[0];
  const embedUrl = useMemo(() => (id ? `${origin}/embed/badge/${id}?style=${style}` : ''), [id, style, origin]);
  const snippet = useMemo(() => {
    if (!id) return '';
    return `<iframe src="${origin}/embed/badge/${id}?style=${style}" width="${current.w}" height="${current.h}" style="border:0;border-radius:16px" title="AETHER trust badge"></iframe>`;
  }, [id, style, current, origin]);

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: 'Embed copied', description: 'Paste it into any page to show the trust badge.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the snippet manually.', variant: 'destructive' });
    }
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <ShieldCheck className="h-3.5 w-3.5" /> Distribution
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Embed a trust badge</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Drop an AETHER trust receipt onto any page. Paste an answer-version id, pick a style, copy the snippet — no login required.
          </p>
          <div className="mt-2"><AgentGreeter
            agentKey="integration_support"
            to="/integration-support"
            firstGreeting="Hi! I'm your Integration Support assistant. I can help you embed trust badges on your site. Click below if you need help with the snippet."
            returningGreeting="I'm here if you need help embedding a badge."
            label="Ask integration support"
          /></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="avid" className="text-slate-200">Answer version id</Label>
            <Input id="avid" value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="e.g. 64a1f2c3..." className="font-mono text-sm" />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Badge style</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyle(s.key)}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition-colors ${
                    style === s.key ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'
                  }`}
                >
                  {s.label}
                  <div className="text-[10px] text-slate-600 mt-0.5">{s.w}×{s.h}</div>
                </button>
              ))}
            </div>
          </div>

          {snippet && (
            <div className="space-y-2">
              <Label className="text-slate-200 flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> Embed snippet</Label>
              <pre className="text-[12px] font-mono text-slate-300 bg-black/40 border border-white/5 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
              <Button onClick={copy} variant="outline" className="h-9">
                {copied ? <><Check className="h-4 w-4 text-emerald-400" /> Copied</> : <><Copy className="h-4 w-4" /> Copy snippet</>}
              </Button>
            </div>
          )}

          {id && (
            <div className="space-y-2">
              <Label className="text-slate-200 flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> One-line script (auto-updates, style-isolated)</Label>
              <pre className="text-[12px] font-mono text-slate-300 bg-black/40 border border-white/5 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{`<script src="${origin}/embed.js" data-id="${id}" data-style="${style}"></script>`}</pre>
              <p className="text-[11px] text-slate-500">Hosts this badge via a single script tag — it loads an iframe that always reflects the live trust score.</p>
            </div>
          )}

          {embedUrl && (
            <div className="space-y-2">
              <Label className="text-slate-200">Live preview</Label>
              <div className="rounded-xl border border-white/10 bg-[#070A0F] p-4 flex justify-center">
                <iframe src={embedUrl} width={current.w} height={current.h} style={{ border: 0, borderRadius: 16 }} title="AETHER trust badge preview" />
              </div>
              <a href={`${origin}/verify/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-emerald-300/80 hover:text-emerald-300">
                Open full proof <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200 mb-1"><Puzzle className="h-4 w-4 text-emerald-400" /> Want it in the browser, not just embedded?</div>
          <p className="text-sm text-slate-400">The AETHER browser extension verifies any AI answer with one right-click — anywhere on the web.</p>
          <Link to="/extension" className="inline-flex items-center gap-1.5 mt-3 text-sm text-emerald-300 hover:text-emerald-200">Get the browser extension →</Link>
        </div>
      </div>
    </AppShell>
  );
}