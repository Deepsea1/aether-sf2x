import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Search, Link2, Check, Fingerprint, Scale } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Public warrant proof page — paste a warrant id OR the signed hash itself and
// see the full cryptographic proof: signature verdict, per-claim basis, the
// tribunal lineage that produced it, and whether YOU could re-verify it with
// nothing but the public key. No auth. Don't trust us — verify the math.

function schemeBadge(v) {
  if (!v) return null;
  if (v.signature_scheme === 'Ed25519') {
    return { label: 'Ed25519 — publicly verifiable', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' };
  }
  if (v.signature_scheme === 'HMAC-SHA256') {
    return { label: 'HMAC — server-attested (legacy)', cls: 'text-amber-300 border-amber-400/30 bg-amber-400/10' };
  }
  return { label: `${v.signature_scheme || 'unknown'} — legacy seal`, cls: 'text-slate-300 border-white/20 bg-white/5' };
}

function ConfidenceBar({ value }) {
  const pct = Math.round((Number(value) || 0) * 100);
  const tone = pct >= 75 ? 'bg-emerald-400/80' : pct >= 45 ? 'bg-amber-400/80' : 'bg-rose-400/80';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-400 tabular-nums">{pct}%</span>
    </div>
  );
}

export default function WarrantProof() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  const lookup = async (value) => {
    const needle = String(value || '').trim();
    if (!needle) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      // The signature artifact always starts with sf2x_ — anything else is an id.
      const payload = needle.startsWith('sf2x_') ? { signed_hash: needle, limit: 1 } : { warrant_id: needle, limit: 1 };
      const res = await base44.functions.invoke('warrantRegistry', payload);
      const data = res?.data || res;
      const v = data?.verified_warrant;
      if (!v) {
        setErr('No warrant found for that id or hash. The registry is honest about its gaps — this is a true miss, not a hidden answer.');
      } else {
        setResult({ v, root: data.root, count: data.count });
        setSearchParams({ q: needle }, { replace: true });
      }
    } catch (e) {
      setErr(e?.message || 'Registry unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get('q');
    if (initial) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const url = `${window.location.origin}/warrant-proof?q=${encodeURIComponent(q.trim())}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable — the URL bar already has it */ }
  };

  const v = result?.v;
  const badge = schemeBadge(v);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <Fingerprint className="h-3.5 w-3.5" /> Public Proof
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Warrant Proof</h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
            Paste a warrant id or its signed hash. You get the full proof: the cryptographic seal,
            every atomic claim it rests on, and the tribunal lineage that produced it.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="warrant id or sf2x_… hash"
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && lookup(q)}
            />
            <Button onClick={() => lookup(q)} disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1.5">Verify</span>
            </Button>
          </div>
          {err && <div className="mt-3 text-sm text-rose-300">{err}</div>}
        </div>

        {v && (
          <>
            <div className={`rounded-2xl border p-5 mb-6 ${v.signature_valid ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-rose-400/30 bg-rose-400/5'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {v.signature_valid
                    ? <ShieldCheck className="h-8 w-8 text-emerald-300" />
                    : v.signed_hash ? <ShieldAlert className="h-8 w-8 text-rose-300" /> : <ShieldQuestion className="h-8 w-8 text-slate-400" />}
                  <div>
                    <div className={`text-lg font-semibold ${v.signature_valid ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {v.signature_valid ? 'Signature verified' : 'Signature did NOT verify'}
                    </div>
                    <div className="text-[12px] text-slate-400">
                      validity: <span className="text-slate-300">{v.validity_status || '—'}</span>
                      {v.expiry_date && <> · expires <span className="text-slate-300">{String(v.expiry_date).slice(0, 10)}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badge && <span className={`text-[11px] px-2.5 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>}
                  <Button variant="outline" size="sm" onClick={share}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{copied ? 'Copied' : 'Share'}</span>
                  </Button>
                </div>
              </div>
              {v.publicly_verifiable && v.signature_public_key && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Verify it yourself — Ed25519 public key</div>
                  <div className="font-mono text-[11px] text-emerald-300/80 break-all">{v.signature_public_key}</div>
                </div>
              )}
              {!v.publicly_verifiable && v.signed_hash && (
                <div className="mt-3 text-[12px] text-slate-400">
                  This warrant carries a legacy seal: the registry attests it server-side, but the key can't be
                  published without becoming forgeable. Newer warrants are sealed with Ed25519 and verifiable by anyone.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Warranted conclusion</div>
              <div className="text-sm text-slate-200">{v.conclusion || '—'}</div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Confidence</span>
                <ConfidenceBar value={v.confidence_score} />
              </div>
              {(v.premises || []).length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">Premises ({v.premises.length})</div>
                  <ul className="space-y-1.5">
                    {v.premises.map((p, i) => (
                      <li key={i} className="text-[13px] text-slate-300 flex gap-2"><span className="text-slate-600">{i + 1}.</span> {p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {(v.claims || []).length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
                <div className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Scale className="h-4 w-4" /> Per-claim basis ({v.claims.length})</div>
                <div className="space-y-3">
                  {v.claims.map((c, i) => (
                    <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[13px] text-slate-200">{c.claim}</div>
                        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${c.supported ? 'text-emerald-300 border-emerald-400/30' : 'text-rose-300 border-rose-400/30'}`}>
                          {c.supported ? 'supported' : 'unsupported'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ConfidenceBar value={c.confidence} />
                        {c.note && <span className="text-[11px] text-slate-500">{c.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {(v.issues || []).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-amber-400/80 mb-2">Verifier-flagged issues</div>
                    <div className="flex flex-wrap gap-1.5">
                      {v.issues.map((iss, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/20 text-amber-200/90">{String(iss)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
              <div className="text-sm font-medium text-white mb-3">Lineage</div>
              <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Warrant</div>
                  <div className="font-mono text-slate-300 break-all mt-0.5">{v.warrant_id}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Answer version</div>
                  <div className="font-mono text-slate-300 break-all mt-0.5">{v.answer_version_id}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Signed hash</div>
                  <div className="font-mono text-slate-300 break-all mt-0.5">{v.signed_hash || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Issued</div>
                  <div className="text-slate-300 mt-0.5">{v.created_date ? String(v.created_date).slice(0, 19).replace('T', ' ') : '—'}</div>
                </div>
              </div>
              {(v.verifier_lineage || []).length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">Tribunal roles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {v.verifier_lineage.map((r, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-white/15 text-slate-300">
                        {r.role}{r.model_family ? ` · ${r.model_family}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result?.root && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Transparency chain root ({result.count} warrants)</div>
                  <div className="font-mono text-[11px] text-slate-400 break-all">{result.root}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
