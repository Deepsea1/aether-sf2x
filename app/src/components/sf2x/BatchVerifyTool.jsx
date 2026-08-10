import React, { useState } from 'react';
import { Layers, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// Batch verification tool — powered by the `batchVerify` function.
// Developers paste multiple texts (one per line) and verify them all at once.

function tone(t) { return t >= 75 ? 'text-emerald-300' : t >= 50 ? 'text-amber-300' : 'text-rose-300'; }
function verdictTone(v) { return v === 'verified' ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : v === 'contested' ? 'text-amber-300 bg-amber-400/10 ring-amber-400/30' : 'text-rose-300 bg-rose-400/10 ring-rose-400/30'; }

export default function BatchVerifyTool() {
  const [texts, setTexts] = useState('Vitamin C prevents the common cold.\nA non-compete clause is enforceable indefinitely in all US states.\nRust guarantees memory safety without a garbage collector.');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState(null);

  async function run() {
    const arr = texts.split('\n').map((t) => t.trim()).filter(Boolean);
    if (!arr.length || loading) return;
    setLoading(true); setErr(null); setResults(null);
    try {
      const res = await base44.functions.invoke('batchVerify', { texts: arr });
      const d = res?.data || res;
      const list = Array.isArray(d) ? d : (d?.results || []);
      setResults(list);
    } catch (e) { setErr(e?.message || 'Batch verification failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-5 my-6">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-4 w-4 text-emerald-400" />
        <h3 className="font-heading text-base font-semibold text-foreground">Batch verification</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">Paste multiple texts — one per line. POST /batchVerify verifies them all and returns a trust score + verdict for each.</p>
      <Textarea value={texts} onChange={(e) => setTexts(e.target.value)} rows={5} className="text-sm mb-3 font-mono" placeholder="One text per line…" />
      <Button onClick={run} disabled={loading || !texts.trim()} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : <><ShieldCheck className="h-4 w-4" /> Verify all</>}
      </Button>

      {err && <div className="mt-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-400/10 rounded-md px-3 py-2 border border-amber-400/20"><AlertCircle className="h-3.5 w-3.5" /> {err}</div>}

      {results && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/10">
                <th className="text-left text-[10px] uppercase tracking-wider text-slate-500 px-3 py-2 font-medium">Text</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Trust</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Verdict</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const trust = Number(r.trust_score ?? r.score ?? 0);
                const verdict = r.verdict || (trust >= 75 ? 'verified' : trust >= 50 ? 'contested' : 'rejected');
                const issues = r.corrections?.length ?? r.corrections_count ?? 0;
                return (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2.5 text-[12px] text-slate-300 max-w-xs truncate" title={r.text || r.text_preview}>{r.text || r.text_preview || `Text ${i + 1}`}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${tone(trust)}`}>{Math.round(trust)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${verdictTone(verdict)}`}>{verdict}</span></td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-slate-400">{issues}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}