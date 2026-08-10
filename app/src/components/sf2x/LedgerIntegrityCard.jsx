import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Link2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Calls verifyLedgerIntegrity (app/base44/functions/verifyLedgerIntegrity) to
// recompute event hashes, verify Ed25519 signatures, and check
// previous_event_hash chain continuity on the caller's own AuditLog chain.
// Runs automatically on mount; the button lets the viewer re-check on demand.
export default function LedgerIntegrityCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const check = async () => {
    setLoading(true); setErr('');
    try {
      const res = await base44.functions.invoke('verifyLedgerIntegrity', {});
      setResult(res?.data || null);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Integrity check failed.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); }, []);

  const broken = result?.broken || 0;
  const checked = result?.entries_checked || 0;
  const intact = Math.max(0, checked - broken);

  return (
    <div className={`rounded-2xl border p-5 ${broken > 0 ? 'border-rose-400/20 bg-rose-400/[0.03]' : 'border-white/10 bg-[#0B0F16]'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Ledger Integrity</h3>
        </div>
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Run integrity check
        </button>
      </div>

      {loading && !result && (
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking ledger…</div>
      )}

      {err && <p className="text-[11px] text-rose-300">{err}</p>}

      {!loading && !err && result && result.status === 'empty' && (
        <p className="text-xs text-slate-600">No ledger events yet.</p>
      )}

      {!loading && result && result.status !== 'empty' && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Events checked</div>
              <div className="text-lg font-semibold text-slate-100 tabular-nums">{checked}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Verified</div>
              <div className="text-lg font-semibold text-emerald-300 tabular-nums">{intact}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-rose-400" /> Broken</div>
              <div className={`text-lg font-semibold tabular-nums ${broken > 0 ? 'text-rose-300' : 'text-slate-100'}`}>{broken}</div>
            </div>
          </div>

          {broken > 0 && (
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {(result.details || []).map((d, i) => (
                <div key={d.event_id || i} className="text-[11px] rounded-lg border border-rose-400/10 bg-rose-400/[0.03] px-2.5 py-1.5">
                  <span className="text-rose-300 font-mono">{d.event_id || 'unknown'}</span>
                  <span className="text-slate-500"> · {d.event_type || 'unknown'}</span>
                  <p className="text-slate-500">{d.reason || 'chain link broken'}</p>
                </div>
              ))}
            </div>
          )}

          {broken === 0 && (
            <p className="text-[11px] text-slate-500">Chain intact — every entry's hash, signature, and link to the previous entry verified.</p>
          )}
        </>
      )}
    </div>
  );
}
