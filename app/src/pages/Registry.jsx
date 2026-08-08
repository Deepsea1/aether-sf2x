import React, { useEffect, useState } from 'react';
import { ShieldCheck, Fingerprint, Loader2, Check, X, ExternalLink, Search, Link2 } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function toneFor(v) {
  if (v === 'valid') return 'text-emerald-300';
  if (v === 'weak') return 'text-amber-300';
  return 'text-rose-300';
}

export default function Registry() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('warrantRegistry', { limit: 100 });
      setData(res?.data || res);
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'Unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const verify = async () => {
    if (!q.trim()) return;
    setVerifying(true);
    setVerified(null);
    try {
      const res = await base44.functions.invoke('warrantRegistry', { warrant_id: q.trim() });
      const v = (res?.data || res).verified_warrant;
      setVerified(v || { warrant_id: q.trim(), signature_valid: false, note: 'Warrant not found' });
    } catch (e) {
      setVerified({ warrant_id: q.trim(), signature_valid: false, note: e?.message || 'Error' });
    } finally {
      setVerifying(false);
    }
  };

  const root = data?.root;
  const chain = data?.chain || [];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <Fingerprint className="h-3.5 w-3.5" /> Transparency Log
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Warrant Registry</h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
            An append-only, independently-verifiable log of every attestation SF2X has signed.
            The chain root is tamper-evident — any insertion, removal, or modification changes it.
            Don't trust us. Verify the math.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Chain root (SHA-256)</div>
              {loading ? (
                <div className="flex items-center gap-2 text-slate-500 mt-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> computing…</div>
              ) : (
                <div className="font-mono text-[12px] text-emerald-300/90 mt-1 break-all">{root || '—'}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Warrants logged</div>
              <div className="text-2xl font-semibold text-white tabular-nums">{data?.count ?? '—'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="text-sm font-medium text-white mb-2 flex items-center gap-2"><Search className="h-4 w-4" /> Verify a warrant by id</div>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="warrant id…" className="font-mono text-sm" onKeyDown={(e) => e.key === 'Enter' && verify()} />
            <Button onClick={verify} disabled={verifying || !q.trim()} className="shrink-0">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify
            </Button>
          </div>

          {verified && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                {verified.signature_valid ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300 text-sm"><Check className="h-4 w-4" /> Signature valid</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-rose-300 text-sm"><X className="h-4 w-4" /> Signature invalid / not found</span>
                )}
                <span className="text-[11px] text-slate-500 font-mono">{verified.signature_scheme || ''}</span>
              </div>
              {verified.answer_version && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <Field label="Validity" value={<span className={toneFor(verified.validity_status)}>{verified.validity_status}</span>} />
                  <Field label="Confidence" value={`${Math.round((verified.confidence_score || 0) * 100)}%`} />
                  <Field label="Premises" value={verified.premises_count} />
                  <Field label="Sources" value={verified.sources_count} />
                </div>
              )}
              {verified.source_snapshots && verified.source_snapshots.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Preserved evidence ({verified.source_snapshots.length})</div>
                  <div className="space-y-1.5">
                    {verified.source_snapshots.map((s, i) => (
                      <div key={i} className="text-[11px] flex items-start gap-2">
                        <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${s.content_hash ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <div className="min-w-0">
                          <div className="text-slate-300 truncate">{s.url}</div>
                          {s.content_hash && <div className="font-mono text-slate-500 break-all">sha256:{s.content_hash.slice(0, 32)}…</div>}
                          <div className="text-slate-600">status {s.status} · {s.content_length || 0} bytes · {new Date(s.fetched_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {verified.answer_version_id && (
                <a href={`/verify/${verified.answer_version_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-emerald-300/80 hover:text-emerald-300">
                  <Link2 className="h-3 w-3" /> Open full proof <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 text-sm font-medium text-white">Recent chain</div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : err ? (
            <div className="px-5 py-6 text-sm text-rose-300">{err}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
                  <tr className="border-b border-white/5">
                    <th className="text-left font-medium px-5 py-2">Created</th>
                    <th className="text-left font-medium px-3 py-2">Validity</th>
                    <th className="text-right font-medium px-3 py-2">Conf.</th>
                    <th className="text-right font-medium px-3 py-2">Src</th>
                    <th className="text-right font-medium px-3 py-2">Evidence</th>
                    <th className="text-left font-medium px-3 py-2">Signed hash</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.map((w) => (
                    <tr key={w.warrant_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-2 text-slate-400 whitespace-nowrap">{new Date(w.created_date).toLocaleDateString()}</td>
                      <td className={`px-3 py-2 ${toneFor(w.validity_status)}`}>{w.validity_status}</td>
                      <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Math.round((w.confidence_score || 0) * 100)}%</td>
                      <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{w.sources_count}</td>
                      <td className="px-3 py-2 text-right">
                        {w.evidence_preserved > 0 ? <span className="text-emerald-300/80">{w.evidence_preserved}📷</span> : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500 truncate max-w-[200px]">{w.signed_hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className="text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}