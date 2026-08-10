import React, { useState } from 'react';
import { FileSpreadsheet, Loader2, ShieldCheck, ShieldX, AlertTriangle, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';

export default function Batch() {
  const [csv, setCsv] = useState('Vitamin C prevents the common cold.\nDaily low-dose aspirin is safe for everyone over 40.\nThe Eiffel Tower is in London.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function run() {
    if (!csv.trim() || loading) return;
    setLoading(true); setErr(null); setResult(null);
    try {
      const res = await base44.functions.invoke('verifyBatch', { csv });
      const d = res?.data || res;
      if (d?.error) setErr(d.error); else setResult(d);
    } catch (e) { setErr(e?.message || 'Batch failed.'); }
    finally { setLoading(false); }
  }

  function download() {
    if (!result) return;
    const rows = [['text', 'trust_score', 'verdict', 'issues'], ...result.results.map((r) => [JSON.stringify(r.text), r.trust_score ?? '', r.verdict ?? r.error ?? '', r.issues ?? ''])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'aether-batch-audit.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const items = csv.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><FileSpreadsheet className="h-3.5 w-3.5" /> Batch Audit</div>
          <h1 className="font-heading text-xl font-semibold text-white">Audit your AI history</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">Retroactively verify old AI transcripts, support chats, and model logs. Paste up to 10 texts (one per line) — Aether runs the tribunal on each and flags hallucinations.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-3">
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder="One AI response per line (max 10)..." className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 resize-none" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-600">{items.length} item{items.length === 1 ? '' : 's'} (max 10)</span>
            <Button onClick={run} disabled={loading || !items.length} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Run batch audit
            </Button>
          </div>
          {err && <div className="text-sm text-rose-300">{err}</div>}
        </div>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Audited" value={result.count} />
              <Stat label="Verified" value={result.verified} tone="emerald" />
              <Stat label="Flagged" value={result.flagged} tone="rose" />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={download} className="h-11 md:h-8 border-white/10 text-slate-300"><Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV</Button>
            </div>
            <div className="space-y-2">
              {result.results.map((r, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[13px] text-slate-300 flex-1 line-clamp-2">{r.text}</div>
                    {r.verdict ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-lg font-semibold ${r.trust_score >= 75 ? 'text-emerald-300' : r.trust_score >= 50 ? 'text-amber-300' : 'text-rose-300'}`}>{r.trust_score}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${r.verdict === 'verified' ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : r.verdict === 'contested' ? 'text-amber-300 ring-amber-400/30 bg-amber-400/10' : 'text-rose-300 ring-rose-400/30 bg-rose-400/10'}`}>{r.verdict}</span>
                      </div>
                    ) : <span className="text-xs text-rose-300">{r.error}</span>}
                  </div>
                  {r.corrections?.length > 0 && (
                    <ul className="mt-2 space-y-1">{r.corrections.slice(0, 2).map((c, j) => <li key={j} className="text-[11px] text-slate-500 flex gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />{c}</li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone = 'slate' }) {
  const cls = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-white';
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}