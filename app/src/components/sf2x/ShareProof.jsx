import React, { useState } from 'react';
import { Copy, Check, Printer, Download, Code2, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ShareProof({ id }) {
  const [copied, setCopied] = useState('');
  const [saving, setSaving] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const verifyUrl = `${origin}/verify/${id}`;
  const embed = `<iframe src="${origin}/badge/${id}" width="360" height="220" frameborder="0" title="AETHER trust badge" style="border:0;border-radius:16px"></iframe>`;

  async function copy(key, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1600);
    } catch { /* clipboard unavailable */ }
  }

  async function downloadPng() {
    const el = document.getElementById('aether-proof');
    if (!el) return;
    setSaving(true);
    try {
      const mod = await import('html2canvas');
      const html2canvas = mod.default;
      const canvas = await html2canvas(el, { backgroundColor: '#070A0F', scale: 2 });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `aether-proof-${id}.png`;
      a.click();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  const btn = 'h-8 border-white/10 text-slate-300 hover:bg-white/5 hover:text-white';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-3">Share this proof</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className={btn} onClick={() => copy('link', verifyUrl)}>
          {copied === 'link' ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-300" /> : <LinkIcon className="h-3.5 w-3.5 mr-1.5" />}
          Copy verify link
        </Button>
        <Button variant="outline" size="sm" className={btn} onClick={() => copy('embed', embed)}>
          {copied === 'embed' ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-300" /> : <Code2 className="h-3.5 w-3.5 mr-1.5" />}
          Copy embed code
        </Button>
        <Button variant="outline" size="sm" className={btn} onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF
        </Button>
        <Button variant="outline" size="sm" className={btn} disabled={saving} onClick={downloadPng}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Download PNG
        </Button>
      </div>
      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
        Embed the badge on your site to show an AETHER-verified trust score; it links back to this tamper-evident proof page.
      </p>
    </div>
  );
}