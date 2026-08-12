import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Search, Link2, Check, Fingerprint, Scale, Hash } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Public warrant proof page — paste a warrant id OR the signed hash itself and
// see the integrity proof: signature verdict, what the warrant covers (counts),
// the tribunal lineage that produced it, and whether YOU could re-verify it
// with nothing but the public key. Warrant CONTENT is access-controlled — the
// registry publishes metadata only (MASTER_PLAN v5 §9.2); the signature is the
// public commitment to that content. No auth. Don't trust us — verify the math.

function schemeBadge(v) {
  if (!v) return null;
  if (v.signature_scheme === 'Ed25519-JCS-v2') {
    return { label: 'Ed25519 · RFC 8785 canonical', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' };
  }
  if (v.signature_scheme === 'Ed25519') {
    return { label: 'Ed25519 — publicly verifiable', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' };
  }
  if (v.signature_scheme === 'HMAC-SHA256') {
    return { label: 'HMAC — server-attested (legacy)', cls: 'text-amber-300 border-amber-400/30 bg-amber-400/10' };
  }
  return { label: `${v.signature_scheme || 'unknown'} — legacy seal`, cls: 'text-slate-300 border-white/20 bg-white/5' };
}

// The listing window we ask the registry for — the same 500 the Proof Theater
// uses, and the registry's own ceiling.
//
// THE BUG THIS FIXES (kept as a warning): this page used to send limit: 1. The
// registry builds its Merkle tree from the window it just listed, so a window of
// one leaf means only the single newest warrant can ever be proven — every other
// warrant fell outside the tree and came back inclusion_proof: null, silently,
// on the page whose entire job is public proof. A narrow window does not make a
// proof smaller; it makes it non-existent.
const REGISTRY_LIMIT = 500;

// Client-side RFC 6962 inclusion check — recomputes leaf → root with WebCrypto
// only, so "this warrant is in the log" is verified in YOUR browser, not taken
// on the server's word. Mirrors shared/merkle.js (RFC6962-SHA256): leaf hash =
// SHA-256(0x00 || leaf bytes), node hash = SHA-256(0x01 || left || right); the
// fold follows RFC 9162 §2.1.3.2. Any malformed input resolves to unverified.
async function verifyInclusionInBrowser(proof, expectedRoot, leafSource) {
  const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => Uint8Array.from(String(h || '').match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
  const sha = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  };
  const leaf = await sha(concat(Uint8Array.of(0x00), new TextEncoder().encode(String(leafSource || ''))));
  const leafMatches = toHex(leaf) === String(proof.leaf_hash || '');
  const treeSize = Number(proof.tree_size);
  let fn = Number(proof.index);
  if (!Number.isInteger(fn) || !Number.isInteger(treeSize) || fn < 0 || fn >= treeSize) {
    return { verified: false, leafMatches, rootMatches: false };
  }
  let sn = treeSize - 1;
  let node = leaf;
  for (const sibling of proof.siblings || []) {
    if (sn === 0) return { verified: false, leafMatches, rootMatches: false };
    const p = fromHex(sibling);
    if (p.length !== 32) return { verified: false, leafMatches, rootMatches: false };
    if ((fn & 1) === 1 || fn === sn) {
      node = await sha(concat(Uint8Array.of(0x01), p, node));
      if ((fn & 1) === 0) {
        while (fn !== 0 && (fn & 1) === 0) { fn >>= 1; sn >>= 1; }
      }
    } else {
      node = await sha(concat(Uint8Array.of(0x01), node, p));
    }
    fn >>= 1;
    sn >>= 1;
  }
  const rootMatches = sn === 0 && toHex(node) === String(expectedRoot || '').toLowerCase();
  return { verified: leafMatches && rootMatches, leafMatches, rootMatches };
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
  const [proofCheck, setProofCheck] = useState(null);

  const lookup = async (value) => {
    const needle = String(value || '').trim();
    if (!needle) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      // The signature artifact always starts with sf2x_ — anything else is an id.
      const payload = needle.startsWith('sf2x_')
        ? { signed_hash: needle, limit: REGISTRY_LIMIT }
        : { warrant_id: needle, limit: REGISTRY_LIMIT };
      const res = await base44.functions.invoke('warrantRegistry', payload);
      const data = res?.data || res;
      const v = data?.verified_warrant;
      if (!v) {
        setErr('No warrant found for that id or hash. The registry is honest about its gaps — this is a true miss, not a hidden answer.');
      } else {
        setResult({ v, root: data.root, count: data.count, merkle_root: data.merkle_root, tree_size: data.tree_size });
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

  // Re-run the in-browser inclusion check whenever a new proof arrives. Older
  // registry responses carry no proof — the card simply doesn't render.
  useEffect(() => {
    const proof = result?.v?.inclusion_proof;
    const merkleRoot = result?.merkle_root;
    if (!proof || !merkleRoot) { setProofCheck(null); return; }
    let cancelled = false;
    setProofCheck({ pending: true });
    // The leaf is the warrant's signed hash (falling back to its id) — the
    // exact leaf material the registry commits to merkle_root.
    verifyInclusionInBrowser(proof, merkleRoot, result.v.signed_hash || result.v.warrant_id)
      .then((check) => { if (!cancelled) setProofCheck(check); })
      .catch(() => { if (!cancelled) setProofCheck({ verified: false, leafMatches: false, rootMatches: false }); });
    return () => { cancelled = true; };
  }, [result]);

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
            Paste a warrant id or its signed hash. You get the integrity proof: the cryptographic seal,
            what it covers, and the tribunal lineage that produced it. The content itself stays with
            its owner — the signature is the public commitment to it.
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
              <div className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Scale className="h-4 w-4" /> What this warrant covers</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  ['Claims', v.claims_count],
                  ['Premises', v.premises_count],
                  ['Sources', v.sources_count],
                  ['Snapshots', v.evidence_preserved],
                  ['Flagged issues', v.issues_count],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                    <div className="text-lg font-semibold text-slate-200 tabular-nums">{Number(n) || 0}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Confidence</span>
                <ConfidenceBar value={v.confidence_score} />
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 text-[12px] text-slate-400">
                Warrant content — the claims, premises, sources, and evidence snapshots themselves — is
                access-controlled and stays with its owner. The signature above is the public, tamper-evident
                commitment to that content: change any of it and verification breaks.
              </div>
              <div className="mt-2 text-[12px] text-slate-400">
                Display eligibility: verify this warrant still matches a given text via{' '}
                <span className="font-mono text-slate-300">warrantRegistry?op=eligibility</span> — the content
                never leaves your side, only its SHA-256.
              </div>
            </div>

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
                {v.key_id && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Signing key</div>
                    <div className="font-mono text-slate-300 break-all mt-0.5">{v.key_id}</div>
                  </div>
                )}
                {v.payload_hash_v2 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Canonical payload hash</div>
                    <div className="font-mono text-slate-300 break-all mt-0.5">{v.payload_hash_v2}</div>
                  </div>
                )}
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

            {!(v.inclusion_proof && result?.merkle_root) ? (
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
                <div className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Hash className="h-4 w-4" /> Transparency proof</div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <ShieldQuestion className="h-4 w-4 text-slate-400" />
                  {!v.inclusion_proof
                    ? 'No inclusion proof was issued for this warrant.'
                    : 'This response published no Merkle root, so there is nothing to fold against.'}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 text-[12px] text-slate-400 leading-relaxed">
                  {!v.inclusion_proof ? (
                    <>
                      The registry proves inclusion only for warrants inside its current listing window — the newest{' '}
                      <span className="tabular-nums text-slate-300">{REGISTRY_LIMIT}</span> by issue date, of which this
                      response carried{' '}
                      <span className="tabular-nums text-slate-300">{result?.count ?? 'an unstated number'}</span>. This
                      warrant falls outside that window, so no proof was issued: a proof folded against a root the
                      warrant is not actually under would be worse than none. Nothing above is weakened by this — it is a
                      proof that was never issued, not a proof that failed. Older warrants are covered by the signed tree
                      heads over the full log (<span className="font-mono text-slate-300">warrantRegistry?op=checkpoint</span>).
                    </>
                  ) : (
                    <>
                      Without a published root there is no value to compare a recomputed path against, so this page
                      claims no inclusion verdict — neither pass nor fail.
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
                <div className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Hash className="h-4 w-4" /> Transparency proof</div>
                {proofCheck?.pending ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Recomputing the Merkle path in your browser…
                  </div>
                ) : proofCheck?.verified ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> Inclusion proof verified in your browser — this warrant is in the log.
                  </div>
                ) : proofCheck ? (
                  <div className="flex items-center gap-2 text-sm text-rose-300">
                    <ShieldAlert className="h-4 w-4" /> Proof mismatch — the recomputed {proofCheck.leafMatches ? 'root' : 'leaf'} does not match. Do not trust this inclusion claim.
                  </div>
                ) : null}
                <div className="mt-4 grid sm:grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Merkle root ({result.tree_size} leaves)</div>
                    <div className="font-mono text-slate-300 break-all mt-0.5">{result.merkle_root}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Leaf {v.inclusion_proof.index} · {(v.inclusion_proof.siblings || []).length} siblings · {v.inclusion_proof.algorithm}</div>
                    <div className="font-mono text-slate-300 break-all mt-0.5">{v.inclusion_proof.leaf_hash}</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 text-[12px] text-slate-400">
                  Your browser hashed the warrant's leaf through the proof's sibling path (RFC 6962, SHA-256 via
                  WebCrypto) and compared the result to the published Merkle root — no server involved in the check.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
