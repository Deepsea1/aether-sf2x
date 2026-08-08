import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import ShareProof from '@/components/sf2x/ShareProof';

function trustColor(t) {
  if (t >= 80) return 'text-emerald-300';
  if (t >= 60) return 'text-amber-300';
  return 'text-rose-300';
}
function trustBg(t) {
  if (t >= 80) return 'bg-emerald-400/10 border-emerald-400/30';
  if (t >= 60) return 'bg-amber-400/10 border-amber-400/30';
  return 'bg-rose-400/10 border-rose-400/30';
}

export default function Verify() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('verifyAnswer', { answer_version_id: id });
        setData(res?.data || res);
      } catch (e) {
        setErr(e?.message || 'Verification failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <header className="flex items-center gap-3 mb-8">
          <div className="relative">
            <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" />
            <div className="relative h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="font-heading text-lg font-semibold text-foreground">SF2X Verification</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Epistemic receipt · tamper-evident</div>
          </div>
        </header>

        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && err && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] p-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-300 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-rose-200">Could not verify</div>
              <div className="text-xs text-rose-300/70 mt-1">{err}</div>
            </div>
          </div>
        )}

        {!loading && data && (
          <>
          <div id="aether-proof" className="space-y-5">
            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${data.signature_valid ? 'border-emerald-400/40 bg-emerald-400/[0.06]' : 'border-rose-400/40 bg-rose-400/[0.06]'}`}>
              {data.signature_valid
                ? <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
                : <XCircle className="h-8 w-8 text-rose-400 shrink-0" />}
              <div>
                <div className={`text-lg font-semibold ${data.signature_valid ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {data.signature_valid ? 'Signature verified' : 'Signature invalid'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {data.signature_valid
                    ? `Warrant is intact and sealed with ${data.signature_scheme}. Any edit to premises or conclusion would break this seal.`
                    : 'The stored signature does not match the warrant content — this answer may have been altered or predates attestation.'}
                </div>
              </div>
            </div>

            {data.inquiry && (
              <div className="rounded-2xl border border-white/10 bg-card p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-2">Inquiry</div>
                <p className="text-sm text-foreground leading-relaxed">{data.inquiry.prompt}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {data.inquiry.domain && <Chip>{data.inquiry.domain}</Chip>}
                  {data.inquiry.stakes_level && <Chip>Stakes: {data.inquiry.stakes_level}</Chip>}
                  <Chip>v{data.version}</Chip>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Warranted answer</div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${trustBg(data.trust_score)} ${trustColor(data.trust_score)}`}>
                  Trust {Math.round(data.trust_score)}/100
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{data.answer_text}</p>
            </div>

            {data.warrant && (
              <div className="rounded-2xl border border-white/10 bg-card p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-3">Decision Validity Warrant</div>
                <div className="text-xs text-slate-400 mb-1">Conclusion</div>
                <p className="text-sm text-foreground mb-4">{data.warrant.conclusion}</p>
                <div className="text-xs text-slate-400 mb-1">Premises</div>
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1 mb-4">
                  {(data.warrant.premises || []).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <Field label="Confidence" value={`${Math.round((data.warrant.confidence_score || 0) * 100)}%`} />
                  <Field label="Validity" value={data.warrant.validity_status} />
                  <Field label="Sources" value={`${(data.warrant.sources || []).length}`} />
                </div>
                {data.warrant.sources?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs text-slate-400 mb-1">Sources</div>
                    <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                      {data.warrant.sources.map((s, i) => <li key={i} className="break-all">{s}</li>)}
                    </ul>
                  </div>
                )}
                {data.warrant.authoritative_grounding && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Authoritative grounding · {data.warrant.authoritative_grounding.domain}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {data.warrant.authoritative_grounding.has_authoritative_sources ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Authoritatively grounded</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-300"><ShieldAlert className="h-3.5 w-3.5" /> Generic web only — no domain-authoritative source</span>
                      )}
                      <span className="text-slate-500">· {data.warrant.authoritative_grounding.claims_authoritatively_grounded}/{data.warrant.authoritative_grounding.total_claims} claims trace to an authoritative source</span>
                      {data.warrant.authoritative_grounding.penalty_applied > 0 && <span className="text-rose-300/80">· −{data.warrant.authoritative_grounding.penalty_applied} trust (non-authoritative)</span>}
                    </div>
                    {data.warrant.authoritative_grounding.authoritative_sources?.length > 0 && (
                      <div className="text-[11px] text-slate-500 mt-1.5">Authoritative sources: {data.warrant.authoritative_grounding.authoritative_sources.join(', ')}</div>
                    )}
                    {data.warrant.grounding_notes && (
                      <div className="text-[11px] text-slate-500 mt-1">Verifier: {data.warrant.grounding_notes}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-card p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-2">Attestation signature</div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="font-mono break-all text-slate-300">{data.signed_hash || '—'}</span>
                <span className="text-slate-600">· {data.signature_scheme}</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-2">Verified at {new Date(data.verified_at).toLocaleString()}</div>
            </div>
          </div>
          <ShareProof id={id} />
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ children }) {
  return <span className="text-[11px] text-slate-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{children}</span>;
}
function Field({ label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className="text-sm text-foreground mt-0.5">{value}</div>
    </div>
  );
}