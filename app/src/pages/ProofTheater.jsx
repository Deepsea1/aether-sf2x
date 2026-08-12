import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Fingerprint, Search, Loader2, Link2, Check, KeyRound, Binary, Scale,
  FileTerminal, ChevronRight, TriangleAlert, BookOpen, Code2,
} from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeState, transition, FOCUS } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';
import StateLegend from '@/components/aether/StateLegend';
import StageRail from '@/components/proof/StageRail';
import MerkleFold from '@/components/proof/MerkleFold';
import HashChip from '@/components/proof/HashChip';
import {
  verifyInclusion, verifySealedDocument, keysDocumentPayload, treeHeadPayload,
  canonicalPayloadHash, verifyPublicSeal, ed25519Supported, SCHEMA,
} from '@/lib/proof/verify';

// THE PROOF THEATER — cryptography you watch your own browser perform.
//
// Everything with a verdict on this page is computed client-side from published
// material: the RFC 8785 canonical bytes, the SHA-256 of those bytes, the
// Ed25519 signature over that hash, and the RFC 6962 Merkle fold from leaf to
// root. The server's opinion is displayed next to ours and is never substituted
// for it.
//
// The hard honesty, stated on the page and not just here: a warrant's V2 seal
// cannot be recomputed by a stranger, because the payload it commits to
// (conclusion, premises, sources) is access-controlled — the registry publishes
// integrity metadata only. A content owner can paste their canonical payload
// into stage 2 and re-derive payload_hash_v2 locally.
//
// The PUBLIC seal (public_seal) closes that gap without moving the privacy
// boundary: it signs a payload made only of published material — the ids, the
// created_date, and SHA-256 hashes of the answer text, conclusion, premises and
// sources. Every field of it comes back in the registry response, so stage 2
// rebuilds the exact signed bytes, hashes them here, and checks the Ed25519
// signature with the key from ?op=keys. Content stays private; only digests
// travel. Warrants issued before the seal existed carry none, and stage 2 says
// exactly that rather than implying they failed a check that never ran.

const REGISTRY_LIMIT = 500;
const STAGE_MS = 5200;

const STAGE_META = [
  {
    key: 'claim',
    title: 'The claim',
    blurb: 'What this warrant covers, how wide its scope is, and who judged it. Nothing here is proven yet — this is the thing we are about to test.',
  },
  {
    key: 'seal',
    title: 'The seal',
    blurb: 'Rebuild the canonical bytes, hash them, and check the Ed25519 signature — in this browser, with the published key.',
  },
  {
    key: 'log',
    title: 'The log',
    blurb: 'Fold the inclusion proof by hand: leaf, sibling, sibling, sibling — until the last hash either is the published root or is not.',
  },
  {
    key: 'limits',
    title: 'The limits',
    blurb: 'What all of this does not prove. Read this part twice; it is the part a certificate normally leaves out.',
  },
];

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{children}</div>;
}

function Stat({ label, value, hint }) {
  const missing = value === null || value === undefined;
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
      {missing ? (
        <div className="text-[11px] font-medium text-slate-500">not published</div>
      ) : (
        <div className="text-lg font-semibold tabular-nums text-slate-200">{value}</div>
      )}
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {hint ? <div className="mt-1 text-[10px] leading-snug text-slate-600">{hint}</div> : null}
    </div>
  );
}

// A canonical string shown as bytes-about-to-be-hashed, with the digest under it.
function CanonicalBlock({ canonical, hash, hashLabel, publishedHash, matches }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#080B11] p-3">
      <Label>Canonical bytes (RFC 8785) — {canonical ? `${new TextEncoder().encode(canonical).length} bytes` : 'unavailable'}</Label>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
        {canonical || '—'}
      </pre>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <HashChip label={hashLabel || 'SHA-256 — computed here'} value={hash} tone={matches === false ? 'mismatch' : 'yours'} />
        <HashChip
          label="Hash the server published"
          value={publishedHash}
          tone={matches === true ? 'match' : matches === false ? 'mismatch' : 'theirs'}
          diffAgainst={matches === false ? hash : null}
        />
      </div>
    </div>
  );
}

// Which of the four cases a loaded warrant is in, said out loud. The axes are
// independent: a warrant's OWN seal is either publicly rebuildable (Ed25519 v2,
// but only by whoever holds the content) or server-attested only (legacy HMAC /
// fingerprint) — and separately it either carries the newer public seal or
// pre-dates it. "Pre-dates it" is an absence and must never read as a failure.
function boundaryNote(warrant, publiclySealed) {
  if (publiclySealed) {
    return warrant.publicly_verifiable
      ? {
        title: 'Two seals, and one of them is yours to check.',
        body: 'The v2 seal above signs the warrant\'s conclusion, premises and sources themselves — access-controlled content a stranger cannot rebuild, so that "valid" stays the server\'s reconstruction, not yours. This warrant also carries a PUBLIC seal over the published hashes of that same content, and your browser verifies that one for itself, below.',
      }
      : {
        title: 'A legacy seal, but a public one alongside it.',
        body: 'This warrant\'s own seal is legacy (HMAC or a content fingerprint) and verifies server-side only — publishing an HMAC key would make it forgeable. It does carry the newer PUBLIC seal over the published hashes, and that one your browser verifies for itself, below.',
      };
  }
  return warrant.publicly_verifiable
    ? {
      title: 'What your browser cannot do here, and why.',
      body: 'This seal is Ed25519 and the key is published — but the bytes it signs are derived from the warrant\'s conclusion, premises and sources, and that content is access-controlled. A stranger cannot rebuild the signed message, so the "valid" above is the server\'s reconstruction of it, not yours. This warrant also pre-dates the public seal, so there is no second, publicly-rebuildable seal to check either — an absence, not a failure. What you can check yourself is directly below.',
    }
    : {
      title: 'What your browser cannot do here, and why.',
      body: 'This warrant carries a legacy seal (HMAC or a content fingerprint). Those verify server-side only: publishing an HMAC key would make the seal forgeable by anyone who read it. It also pre-dates the public seal, so there is no publicly-rebuildable seal on it either — an absence, not a failed check. Treat this as the server attesting, not as public proof.',
    };
}

// The public seal, checked here. Everything this panel shows is derived in the
// browser: the payload is rebuilt from the registry's own published hashes, the
// SHA-256 is computed locally, and the Ed25519 check runs against the key from
// ?op=keys. The server's verdict is not consulted and is not displayed as one.
function PublicSealPanel({ seal, artifact, publishedHash, activeKey }) {
  const pending = !seal;
  const state = pending ? 'unknown' : seal.valid ? 'supported' : seal.supported === false ? 'blocked' : 'unsupported';
  const label = pending
    ? 'Checking in this browser…'
    : seal.valid
      ? 'Public seal verified in your browser'
      : seal.supported === false
        ? 'This browser cannot run the check'
        : `Failed at: ${seal.failedStep}`;
  // The seal names the key that made it. If that is not the key we just fetched,
  // a "valid" here would be valid under the wrong key — say so rather than pass.
  const keyMismatch = !!seal?.keyId && !!activeKey && seal.keyId !== activeKey;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>The public seal — rebuilt and checked here</Label>
        <EpistemicBadge state={state} label={label} />
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
        This seal signs a payload of <strong className="font-medium text-slate-300">hashes, never content</strong>: the
        warrant and answer-version ids, the issue date, and the SHA-256 of the answer text, the conclusion, the premises
        list and the sources list. Every one of those fields is published, so your browser can rebuild the exact bytes
        that were signed — which is precisely what the v2 seal above cannot offer a stranger.
      </p>

      <div className="mt-3">
        <CanonicalBlock
          canonical={seal?.canonical}
          hash={seal?.payload_hash}
          hashLabel="SHA-256 of the payload your browser rebuilt"
          publishedHash={publishedHash}
          matches={seal ? seal.hashMatches : null}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <HashChip label="Public seal artifact (Ed25519)" value={artifact} tone="theirs" />
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <Label>Ed25519 verify</Label>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
            {pending
              ? 'Not run yet.'
              : seal.valid
                ? 'Valid. Your browser rebuilt the payload from the published hashes, hashed it, and checked the signature against the key document. No server was asked, and no warrant content was needed.'
                : seal.reason}
          </p>
          <div className="mt-2 text-[11px] text-slate-500">
            signed by <span className="font-mono">{seal?.keyId || 'no key id published'}</span>
          </div>
        </div>
      </div>

      {seal?.hashMatches === null && seal?.payload_hash ? (
        <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
          The registry published no <span className="font-mono text-[11px]">public_payload_hash</span> to cross-check
          against. That does not weaken the result above: the signature was checked over the hash this browser computed,
          which is the stronger of the two inputs — there is simply one fewer agreement to show you.
        </p>
      ) : null}

      {keyMismatch ? (
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#FB7185]">
          Key mismatch: the seal names <span className="font-mono">{seal.keyId}</span> but the published key document
          serves <span className="font-mono">{activeKey}</span>. The check above ran against the served key, so treat it
          as unresolved until the two agree.
        </p>
      ) : null}

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
        What this does <em>not</em> give you: the content itself. A verified public seal proves the hashes the registry
        publishes are the ones Aether signed, and that none of them has been altered since. It cannot tell you what text
        produced them — only the holder of that text can check a hash against it, on the panel above.
      </p>
    </div>
  );
}

function SelfVerify({ title, code }) {
  return (
    <details className="group mt-4 rounded-xl border border-white/10 bg-[#080B11]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[12px] text-slate-300 hover:text-slate-100">
        <Code2 className="h-3.5 w-3.5 text-slate-500" />
        <span className="font-medium">Verify this yourself</span>
        <span className="text-slate-500">— {title}</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-600 transition-transform group-open:rotate-90" />
      </summary>
      <pre className="overflow-x-auto border-t border-white/10 p-3.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
        {code}
      </pre>
    </details>
  );
}

// Stage state → a token key. `unknown` is the honest default everywhere: a stage
// that has not run is "not yet measured", never a hopeful pass and never a zero.
function sealState(keys, warrant, browserEd, publicSeal) {
  if (browserEd === false) return 'blocked';
  if (!keys) return 'unknown';
  if (!keys.ok) return 'unsupported';
  if (!warrant) return 'supported';
  if (warrant.signature_valid === false) return 'unsupported';
  // A public seal is the one case where this stage can be fully earned: the
  // browser rebuilt the signed payload from published hashes and checked the
  // signature itself, so the verdict is ours, not the server's.
  if (publicSeal) {
    if (publicSeal.valid) return 'supported';
    if (publicSeal.supported === false) return 'blocked';
    return 'unsupported';
  }
  // Otherwise deliberately never 'supported' with a warrant loaded: the key
  // document verified in this browser, but the warrant's own v2 signed message
  // is derived from access-controlled content, so its "valid" is the server's —
  // a real qualification, not a hedge. Stage 2 spells out the difference.
  return 'qualified';
}

export default function ProofTheater() {
  const reduced = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [registry, setRegistry] = useState(null);      // { chain, root, merkle_root, tree_size, count }
  const [warrant, setWarrant] = useState(null);        // verified_warrant

  const [keysDoc, setKeysDoc] = useState(null);
  const [keysSeal, setKeysSeal] = useState(null);
  const [keysError, setKeysError] = useState(null);
  const [head, setHead] = useState(null);
  const [headSeal, setHeadSeal] = useState(null);
  const [headNote, setHeadNote] = useState(null);
  const [browserEd, setBrowserEd] = useState(null);
  const [fold, setFold] = useState(null);
  const [publicSeal, setPublicSeal] = useState(null);

  const [payloadDraft, setPayloadDraft] = useState('');
  const [payloadCheck, setPayloadCheck] = useState(null);

  const askedRef = useRef(false);

  // ——— capability probe: say what THIS browser can do before claiming anything
  useEffect(() => { ed25519Supported().then(setBrowserEd).catch(() => setBrowserEd(false)); }, []);

  // ——— the published key document, verified locally
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('warrantRegistry', { op: 'keys' });
        const doc = res?.data || res;
        if (cancelled) return;
        if (!doc || doc.error || !Array.isArray(doc.keys)) {
          setKeysError(doc?.error || 'The key document is unavailable, so nothing on this page can be checked against a published key.');
          return;
        }
        setKeysDoc(doc);
        const seal = await verifySealedDocument({
          payload: keysDocumentPayload(doc),
          publishedHash: doc.payload_hash,
          signature: doc.signature,
          publicKeyPem: doc.keys[0]?.public_key_pem,
        });
        if (!cancelled) setKeysSeal(seal);
      } catch (e) {
        if (!cancelled) setKeysError(e?.message || 'The key document could not be fetched.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ——— the newest signed tree head, verified locally
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('warrantRegistry', { op: 'checkpoint' });
        const data = res?.data || res;
        if (cancelled) return;
        setHeadNote(data?.note || null);
        const h = data?.head || null;
        setHead(h);
        if (!h) return;
        const pem = keysDoc?.keys?.[0]?.public_key_pem;
        if (!pem) return;
        const seal = await verifySealedDocument({
          payload: treeHeadPayload(h),
          publishedHash: h.payload_hash,
          signature: h.signed_head,
          publicKeyPem: pem,
        });
        if (!cancelled) setHeadSeal(seal);
      } catch { /* checkpoint is optional — its absence is reported, never faked */ }
    })();
    return () => { cancelled = true; };
  }, [keysDoc]);

  // ——— warrant lookup (also returns the chain + roots we fold against)
  const lookup = useCallback(async (value) => {
    const needle = String(value || '').trim();
    setLoading(true);
    setLookupError(null);
    setWarrant(null);
    setFold(null);
    setPublicSeal(null);
    try {
      const body = { limit: REGISTRY_LIMIT };
      if (needle) {
        if (needle.startsWith('sf2x_')) body.signed_hash = needle;
        else body.warrant_id = needle;
      }
      const res = await base44.functions.invoke('warrantRegistry', body);
      const data = res?.data || res;
      setRegistry({
        chain: Array.isArray(data?.chain) ? data.chain : [],
        root: data?.root || null,
        merkle_root: data?.merkle_root || null,
        tree_size: data?.tree_size ?? null,
        count: data?.count ?? null,
      });
      if (needle) {
        const v = data?.verified_warrant;
        if (!v) {
          setLookupError('No warrant in the log matches that id or hash. That is a true miss, not a hidden answer — the registry is enumerable and this is what absence looks like.');
        } else {
          setWarrant(v);
          setSearchParams({ q: needle }, { replace: true });
        }
      }
    } catch (e) {
      setLookupError(e?.message || 'The registry is unreachable, so nothing can be checked right now.');
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    lookup(searchParams.get('q') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ——— the fold, recomputed in this browser whenever a proof arrives
  useEffect(() => {
    const proof = warrant?.inclusion_proof;
    const root = registry?.merkle_root;
    if (!proof || !root) { setFold(null); return undefined; }
    let cancelled = false;
    verifyInclusion(proof, root, warrant.signed_hash || warrant.warrant_id)
      .then((r) => { if (!cancelled) setFold(r); })
      .catch((e) => { if (!cancelled) setFold({ ok: false, failedStep: 'exception', error: String(e?.message || e), steps: [] }); });
    return () => { cancelled = true; };
  }, [warrant, registry]);

  // ——— stage autoplay (a transport, not an animation: reduced motion keeps it)
  useEffect(() => {
    if (!playing) return undefined;
    if (stage >= STAGE_META.length - 1) { setPlaying(false); return undefined; }
    const id = setTimeout(() => setStage((s) => Math.min(STAGE_META.length - 1, s + 1)), reduced ? 1200 : STAGE_MS);
    return () => clearTimeout(id);
  }, [playing, stage, reduced]);

  const share = async () => {
    const url = `${window.location.origin}/proof${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* the address bar already carries it */ }
  };

  // ——— owner-side recomputation of payload_hash_v2 from the canonical payload
  const recomputePayload = async () => {
    try {
      const parsed = JSON.parse(payloadDraft);
      const payload = {
        schema: SCHEMA.warrantV2,
        answer_version_id: parsed.answer_version_id ?? warrant?.answer_version_id ?? '',
        answer_text_sha256: parsed.answer_text_sha256 ?? '',
        conclusion: parsed.conclusion ?? '',
        premises: parsed.premises ?? [],
        sources: parsed.sources ?? [],
      };
      const { canonical, hash } = await canonicalPayloadHash(payload);
      setPayloadCheck({
        canonical,
        hash,
        published: warrant?.payload_hash_v2 || null,
        matches: !!warrant?.payload_hash_v2 && warrant.payload_hash_v2.toLowerCase() === hash,
        error: null,
      });
    } catch (e) {
      setPayloadCheck({ error: e?.message || 'That is not valid JSON.', canonical: null, hash: null, matches: null });
    }
  };

  const stages = useMemo(() => {
    const claimState = warrant ? normalizeState(warrant.validity_status) : 'unknown';
    const s = [
      { ...STAGE_META[0], state: claimState, stateLabel: warrant ? undefined : 'No warrant loaded' },
      { ...STAGE_META[1], state: sealState(keysSeal, warrant, browserEd, publicSeal) },
      {
        ...STAGE_META[2],
        state: !fold ? 'unknown' : fold.verified ? 'supported' : 'unsupported',
        stateLabel: !fold ? (warrant ? 'No inclusion proof' : 'Not yet measured') : undefined,
      },
      { ...STAGE_META[3], state: 'qualified', stateLabel: 'Read the limits' },
    ];
    return s;
  }, [warrant, keysSeal, browserEd, fold, publicSeal]);

  const pem = keysDoc?.keys?.[0]?.public_key_pem || null;
  const activeKey = keysDoc?.keys?.[0]?.key_id || null;
  // Does this warrant even carry a public seal? Warrants issued before the seal
  // existed do not, and that is a different fact from a seal that failed.
  const publiclySealed = !!warrant && (warrant.publicly_sealed === true || !!warrant.public_seal);
  const boundary = warrant ? boundaryNote(warrant, publiclySealed) : null;

  // ——— the public seal, verified in this browser the moment both halves exist
  useEffect(() => {
    if (!publiclySealed) { setPublicSeal(null); return undefined; }
    // Hold while the key document is still in flight. Running now would report
    // "no public key" — a not-yet rendered as a failure, which is the exact lie
    // this page exists to avoid. Once the fetch settles (document or error), the
    // check runs and any real key gap is reported honestly.
    if (!keysDoc && !keysError) { setPublicSeal(null); return undefined; }
    let cancelled = false;
    verifyPublicSeal(warrant, pem)
      .then((r) => { if (!cancelled) setPublicSeal(r); })
      .catch((e) => {
        if (!cancelled) {
          setPublicSeal({
            supported: true, valid: false, failedStep: 'exception',
            reason: String(e?.message || e), payload: null, payload_hash: null,
            canonical: null, publishedHash: null, hashMatches: null, sealed: true,
            keyId: warrant?.public_seal_key_id || null, signature: null,
          });
        }
      });
    return () => { cancelled = true; };
  }, [warrant, pem, publiclySealed, keysDoc, keysError]);

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: FOCUS }}>
            <Fingerprint className="h-3.5 w-3.5" /> Proof Theater
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white sm:text-3xl">
            Watch your browser check the maths.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every verdict below is computed here, on your machine, from material the log publishes: the canonical
            bytes, their SHA-256, the Ed25519 signature over that hash, and the Merkle path from one leaf to the
            published root. Where the server&apos;s word is all we have, the page says so in those words.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EpistemicBadge
              state={browserEd === null ? 'unknown' : browserEd ? 'supported' : 'blocked'}
              size="sm"
              label={browserEd === null ? 'Checking this browser…' : browserEd ? 'This browser can do Ed25519' : 'No Ed25519 in this browser'}
            />
            <span className="text-[11px] text-slate-500">
              {browserEd === false
                ? 'Signature checks will run as far as the hash and then stop honestly. Needs Chrome 137+, Safari 17+ or Firefox 129+.'
                : 'WebCrypto: SHA-256 + Ed25519.'}
            </span>
          </div>
        </header>

        <Surface className="mb-5 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="warrant id, or the sf2x_… seal itself"
              className="font-mono text-sm"
              aria-label="Warrant id or signed hash"
              onKeyDown={(e) => e.key === 'Enter' && lookup(q)}
            />
            <div className="flex gap-2">
              <Button onClick={() => lookup(q)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1.5">Open the proof</span>
              </Button>
              <Button variant="outline" onClick={share}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                <span className="ml-1.5">{copied ? 'Copied' : 'Share'}</span>
              </Button>
            </div>
          </div>
          {lookupError ? (
            <div className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[#FB7185]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{lookupError}</span>
            </div>
          ) : null}
        </Surface>

        <StageRail
          stages={stages}
          active={stage}
          onSelect={(i) => { setPlaying(false); setStage(i); }}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          className="mb-5"
        />

        <motion.div
          key={stage}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition('base', reduced)}
        >
          {/* ————————————————————————————————— 1 · THE CLAIM */}
          {stage === 0 ? (
            <div className="space-y-4">
              {!warrant ? (
                <HonestEmpty
                  title="No warrant is loaded"
                  reason="Paste a warrant id or its sf2x_ seal above, or pick one out of the log below. Nothing is assumed in the meantime — an empty stage is an empty stage."
                  state="unknown"
                  icon={Scale}
                />
              ) : (
                <Surface glow={normalizeState(warrant.validity_status)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Label>The warrant under test</Label>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <EpistemicBadge state={normalizeState(warrant.validity_status)} size="lg" />
                        <span className="text-[12px] text-slate-500">
                          registry status: <span className="font-mono text-slate-400">{warrant.validity_status || 'unstated'}</span>
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <Label>Issued</Label>
                      <div className="mt-1 text-[12px] text-slate-300">
                        {warrant.created_date ? String(warrant.created_date).slice(0, 19).replace('T', ' ') : 'not published'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {warrant.expiry_date ? `expires ${String(warrant.expiry_date).slice(0, 10)}` : 'no expiry published'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Stat label="Claims" value={warrant.claims_count} />
                    <Stat label="Premises" value={warrant.premises_count} />
                    <Stat label="Sources" value={warrant.sources_count} />
                    <Stat label="Snapshots" value={warrant.evidence_preserved} hint="sources frozen at issue" />
                    <Stat label="Flagged" value={warrant.issues_count} />
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <Label>Scope — what the counts above do and do not say</Label>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                      These are the dimensions of the record, not a score. A warrant over{' '}
                      <span className="tabular-nums text-slate-300">{Number(warrant.sources_count) || 0}</span> sources is
                      exactly as strong as those sources are. The content itself — conclusion, premises, source list — is
                      access-controlled and stays with its owner; this page can only prove things about the record.
                    </p>
                  </div>

                  {(warrant.verifier_lineage || []).length > 0 ? (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <Label>Tribunal lineage</Label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {warrant.verifier_lineage.map((r, i) => (
                          <span key={i} className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-slate-300">
                            {r.role}{r.model_family ? ` · ${r.model_family}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <Label>Tribunal lineage</Label>
                      <p className="mt-1.5 text-[12px] text-slate-500">
                        No roles were published with this warrant — not yet measured, rather than none.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                    <HashChip label="Warrant id" value={warrant.warrant_id} />
                    <HashChip label="Answer version" value={warrant.answer_version_id} />
                  </div>
                  {warrant.verify_url ? (
                    <Link
                      to={warrant.verify_url}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-[#7DD3FC] hover:underline"
                    >
                      Open the full verification record <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </Surface>
              )}

              {/* The log itself, as a picker — honest about how small it is. */}
              <Surface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>The log right now</Label>
                  <span className="text-[11px] text-slate-500">
                    {registry?.count ?? '—'} warrants in the listing window
                  </span>
                </div>
                {!registry ? (
                  <p className="mt-3 text-[12px] text-slate-500">Loading the chain…</p>
                ) : (registry.chain || []).length === 0 ? (
                  <HonestEmpty
                    className="mt-3"
                    title="The log is empty"
                    reason="No warrants have been written yet, so there is nothing to prove inclusion of. This page will fill itself in the moment one exists."
                    state="unknown"
                    action={{ label: 'Run a verification', to: '/playground' }}
                  />
                ) : (
                  <ul className="mt-3 divide-y divide-white/5" role="list">
                    {registry.chain.slice(0, 8).map((c) => (
                      <li key={c.warrant_id}>
                        <button
                          type="button"
                          onClick={() => { setQ(c.warrant_id); lookup(c.warrant_id); }}
                          className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                        >
                          <EpistemicBadge state={normalizeState(c.validity_status)} size="sm" withLabel={false} />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400">{c.warrant_id}</span>
                          <span className="hidden shrink-0 text-[11px] text-slate-600 sm:block">
                            {String(c.created_date || '').slice(0, 10)}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>
            </div>
          ) : null}

          {/* ————————————————————————————————— 2 · THE SEAL */}
          {stage === 1 ? (
            <div className="space-y-4">
              <Surface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-white">The published key, checked here</span>
                  </div>
                  <EpistemicBadge
                    state={!keysSeal ? 'unknown' : keysSeal.ok ? 'supported' : keysSeal.failedStep === 'unsupported' ? 'blocked' : 'unsupported'}
                    label={!keysSeal ? 'Not yet measured' : keysSeal.ok ? 'Signature verified in your browser' : `Failed at: ${keysSeal.failedStep}`}
                  />
                </div>

                {keysError ? (
                  <HonestEmpty
                    className="mt-4"
                    title="No key document"
                    reason={keysError}
                    state="blocked"
                    icon={KeyRound}
                  />
                ) : !keysDoc ? (
                  <p className="mt-4 text-[12px] text-slate-500">Fetching <span className="font-mono">?op=keys</span>…</p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Key id</Label>
                        <div className="mt-1 break-all font-mono text-[12px] text-slate-300">{activeKey || 'not published'}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {keysDoc.keys[0]?.algorithm} · status {keysDoc.keys[0]?.status} · schema {keysDoc.schema}
                        </div>
                      </div>
                      <HashChip label="Public key (SPKI PEM)" value={pem} tone="theirs" truncate={0} />
                    </div>

                    <div className="mt-4">
                      <CanonicalBlock
                        canonical={keysSeal?.canonical}
                        hash={keysSeal?.computedHash}
                        publishedHash={keysDoc.payload_hash}
                        matches={keysSeal ? keysSeal.hashMatches : null}
                      />
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <HashChip label="Signature artifact" value={keysDoc.signature} tone="theirs" />
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                        <Label>Ed25519 verify</Label>
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
                          {!keysSeal
                            ? 'Not run yet.'
                            : keysSeal.ok
                              ? 'The signature checks out against the hash your browser just computed, under the key this document publishes. No server was asked.'
                              : keysSeal.error}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 border-t border-white/10 pt-3 text-[11.5px] leading-relaxed text-slate-500">
                      Honest boundary: this document is <em>self-signed</em>. Verifying it proves the bytes were not altered
                      in transit — it cannot prove the key is Aether&apos;s, because a forger who controlled the response could
                      publish their own key and their own valid signature. First-fetch trust has to be anchored in the domain
                      and in the transparency log, not in this signature.
                    </p>

                    <SelfVerify
                      title="the key document, in ~15 lines"
                      code={`// Paste into any modern browser console, or Node 18.4+.
// FUNCTION_URL is the same base the rest of the API docs use (/warrant-spec);
// op=keys is a plain GET, so you can also just open it in a tab and paste the JSON.
const doc = await (await fetch(FUNCTION_URL + '/warrantRegistry?op=keys')).json();
const jcs = (v) => v === null ? 'null'
  : Array.isArray(v) ? '[' + v.map(jcs).join(',') + ']'
  : typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}'
  : JSON.stringify(v);
const payload = { schema: doc.schema, keys: doc.keys, legacy_schemes: doc.legacy_schemes };
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jcs(payload))))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
console.log('hash matches:', hash === doc.payload_hash);   // ${keysSeal ? keysSeal.hashMatches : '?'}

const der = Uint8Array.from(atob(doc.keys[0].public_key_pem.replace(/-----[^-]+-----|\\s/g, '')), c => c.charCodeAt(0));
const key = await crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
const sig = Uint8Array.from(atob(doc.signature.slice(13).replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
console.log('signature valid:', await crypto.subtle.verify(
  { name: 'Ed25519' }, key, sig, new TextEncoder().encode(hash)));   // ${keysSeal?.signature ? keysSeal.signature.valid : '?'}
// NOTE: the signed message is the UTF-8 bytes of the hash HEX STRING, not the raw digest.`}
                    />
                  </>
                )}
              </Surface>

              <Surface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Binary className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-white">This warrant&apos;s own seal</span>
                  </div>
                  {!warrant ? (
                    <EpistemicBadge state="unknown" label="No warrant loaded" />
                  ) : !warrant.signature_valid ? (
                    <EpistemicBadge state="unsupported" label="Signature did NOT verify" />
                  ) : publiclySealed ? (
                    <EpistemicBadge
                      state={!publicSeal ? 'unknown' : publicSeal.valid ? 'supported' : publicSeal.supported === false ? 'blocked' : 'unsupported'}
                      label={!publicSeal
                        ? 'Checking the public seal…'
                        : publicSeal.valid
                          ? 'Public seal verified here'
                          : publicSeal.supported === false
                            ? 'This browser cannot run the check'
                            : `Public seal failed at: ${publicSeal.failedStep}`}
                    />
                  ) : (
                    <EpistemicBadge state="qualified" label="Valid — server-verified" />
                  )}
                </div>

                {!warrant ? (
                  <p className="mt-3 text-[12px] text-slate-500">Load a warrant to see its seal.</p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Scheme</Label>
                        <div className="mt-1 font-mono text-[12px] text-slate-300">{warrant.signature_scheme || 'unstated'}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {warrant.schema_version ? `payload schema ${warrant.schema_version}` : 'no v2 payload schema'}
                          {warrant.key_id ? ` · signed by ${warrant.key_id}` : ''}
                        </div>
                      </div>
                      <HashChip label="Seal artifact (also this warrant's Merkle leaf)" value={warrant.signed_hash} tone="theirs" />
                    </div>
                    <div className="mt-3">
                      <HashChip label="payload_hash_v2 — the canonical hash the seal commits to" value={warrant.payload_hash_v2} tone="theirs" />
                    </div>

                    <div className="mt-4 rounded-xl border border-[#C9B08A]/25 bg-[#C9B08A]/[0.05] p-3">
                      <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#C9B08A' }} />
                        <div className="text-[11.5px] leading-relaxed text-slate-300">
                          <strong className="font-medium text-slate-200">{boundary?.title}</strong>{' '}
                          {boundary?.body}
                        </div>
                      </div>
                    </div>

                    {publiclySealed ? (
                      <PublicSealPanel
                        seal={publicSeal}
                        artifact={warrant.public_seal}
                        publishedHash={warrant.public_payload_hash}
                        activeKey={activeKey}
                      />
                    ) : null}

                    {publiclySealed ? (
                      <SelfVerify
                        title="the public seal, from the registry response alone"
                        code={`// Nothing here comes from us but the response you already have + the key document.
const jcs = (v) => v === null ? 'null'
  : Array.isArray(v) ? '[' + v.map(jcs).join(',') + ']'
  : typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}'
  : JSON.stringify(v);

const w = ${JSON.stringify({
                          warrant_id: warrant.warrant_id,
                          answer_version_id: warrant.answer_version_id,
                          answer_text_sha256: warrant.answer_text_sha256 ?? null,
                          conclusion_sha256: warrant.conclusion_sha256 ?? null,
                          premises_sha256: warrant.premises_sha256 ?? null,
                          sources_sha256: warrant.sources_sha256 ?? null,
                          created_date: warrant.created_date,
                        }, null, 2)};

const payload = { schema: 'aether.warrant.public.v1', ...w };   // 8 keys, nothing else
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jcs(payload))))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
console.log('hash matches:', hash === ${JSON.stringify(warrant.public_payload_hash || '')});   // ${publicSeal ? publicSeal.hashMatches : '?'}

const doc = await (await fetch(FUNCTION_URL + '/warrantRegistry?op=keys')).json();
const pem = doc.keys.find(k => k.key_id === ${JSON.stringify(warrant.public_seal_key_id || '')})?.public_key_pem || doc.keys[0].public_key_pem;
const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\\s/g, '')), c => c.charCodeAt(0));
const key = await crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
const sig = Uint8Array.from(atob(${JSON.stringify(warrant.public_seal || '')}.slice(13).replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
console.log('public seal valid:', await crypto.subtle.verify(
  { name: 'Ed25519' }, key, sig, new TextEncoder().encode(hash)));   // ${publicSeal ? publicSeal.valid : '?'}
// The signed message is the UTF-8 bytes of the hash HEX STRING, not the raw digest.`}
                      />
                    ) : null}

                    {warrant.payload_hash_v2 ? (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <Label>If you hold the content — recompute the hash yourself</Label>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                          Paste the canonical payload fields ({' '}
                          <span className="font-mono text-[11px] text-slate-400">answer_version_id, answer_text_sha256, conclusion, premises, sources</span>
                          {' '}). Your browser canonicalizes them under RFC 8785, hashes the result, and compares it to the published{' '}
                          <span className="font-mono text-[11px]">payload_hash_v2</span>. Nothing you paste leaves this page.
                        </p>
                        <textarea
                          value={payloadDraft}
                          onChange={(e) => setPayloadDraft(e.target.value)}
                          spellCheck={false}
                          rows={4}
                          placeholder={'{\n  "answer_text_sha256": "…",\n  "conclusion": "…",\n  "premises": [],\n  "sources": []\n}'}
                          className="mt-2 w-full rounded-lg border border-white/10 bg-[#080B11] p-2.5 font-mono text-[11px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={recomputePayload} disabled={!payloadDraft.trim()}>
                            Canonicalize &amp; hash locally
                          </Button>
                          {payloadCheck && !payloadCheck.error ? (
                            <EpistemicBadge
                              state={payloadCheck.matches ? 'supported' : 'unsupported'}
                              size="sm"
                              label={payloadCheck.matches ? 'Matches payload_hash_v2' : 'Does not match'}
                            />
                          ) : null}
                        </div>
                        {payloadCheck?.error ? (
                          <p className="mt-2 text-[12px] text-[#FB7185]">{payloadCheck.error}</p>
                        ) : payloadCheck ? (
                          <div className="mt-3">
                            <CanonicalBlock
                              canonical={payloadCheck.canonical}
                              hash={payloadCheck.hash}
                              hashLabel="SHA-256 of your canonical bytes"
                              publishedHash={payloadCheck.published}
                              matches={payloadCheck.matches}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </Surface>
            </div>
          ) : null}

          {/* ————————————————————————————————— 3 · THE LOG */}
          {stage === 2 ? (
            <div className="space-y-4">
              {!warrant ? (
                <HonestEmpty
                  title="Nothing to fold yet"
                  reason="An inclusion proof belongs to a specific warrant. Load one above and this stage will hash it, level by level, into the published root."
                  state="unknown"
                  icon={Binary}
                />
              ) : !warrant.inclusion_proof ? (
                <HonestEmpty
                  title="This warrant carries no inclusion proof"
                  reason="The registry only proves inclusion for warrants inside its current listing window. This one falls outside it, so no proof was issued — and a proof against a root it is not actually in would be worse than none."
                  state="unknown"
                  icon={Binary}
                  action={{ label: 'Read how the log works', to: '/registry' }}
                />
              ) : !fold ? (
                <Surface><p className="text-[12px] text-slate-500">Recomputing the path…</p></Surface>
              ) : (
                <MerkleFold
                  fold={fold}
                  leafSource={warrant.signed_hash || warrant.warrant_id}
                  reduced={reduced}
                />
              )}

              <Surface>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">The root itself is signed</span>
                  <EpistemicBadge
                    state={!head ? 'unknown' : !headSeal ? 'unknown' : headSeal.ok ? 'supported' : 'unsupported'}
                    label={!head ? 'No tree head published' : !headSeal ? 'Not yet measured' : headSeal.ok ? 'Head signature verified here' : `Failed at: ${headSeal.failedStep}`}
                  />
                </div>
                {!head ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                    No signed tree head has been published yet. Without one, a fold proves consistency with a root the
                    server computed on demand — not with a durable, dated commitment.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <HashChip label={`Merkle root · ${head.tree_size} leaves · ${String(head.created_date || '').slice(0, 10)}`} value={head.merkle_root} tone="theirs" />
                      <HashChip label="Previous root (the chain link)" value={head.prev_root} tone="theirs" />
                    </div>
                    <div className="mt-3">
                      <CanonicalBlock
                        canonical={headSeal?.canonical}
                        hash={headSeal?.computedHash}
                        publishedHash={head.payload_hash}
                        matches={headSeal ? headSeal.hashMatches : null}
                      />
                    </div>
                    <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
                      This head commits to the FULL log. The fold above runs against the listing window&apos;s root, which
                      is recomputed per request — so a match above and a valid head here are two different facts, and this
                      page will not merge them into one tick.
                      {headNote ? <> <span className="text-slate-600">{headNote}</span></> : null}
                    </p>
                  </>
                )}

                <SelfVerify
                  title="the fold, from the raw proof"
                  code={`const H = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const hex = (b) => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
const un  = (h) => Uint8Array.from(h.match(/.{2}/g), p => parseInt(p, 16));
const cat = (...p) => { const o = new Uint8Array(p.reduce((n,x)=>n+x.length,0)); let i=0; for (const x of p){o.set(x,i); i+=x.length;} return o; };

const leaf = ${JSON.stringify(warrant?.signed_hash || warrant?.warrant_id || 'sf2x_…')};
const proof = ${JSON.stringify(warrant?.inclusion_proof ? { index: warrant.inclusion_proof.index, tree_size: warrant.inclusion_proof.tree_size, siblings: warrant.inclusion_proof.siblings } : { index: 0, tree_size: 0, siblings: [] })};
const root = ${JSON.stringify(registry?.merkle_root || '')};

let node = await H(cat(Uint8Array.of(0x00), new TextEncoder().encode(leaf)));  // RFC 6962 leaf
let fn = proof.index, sn = proof.tree_size - 1;
for (const s of proof.siblings) {
  const p = un(s);
  if ((fn & 1) === 1 || fn === sn) {
    node = await H(cat(Uint8Array.of(0x01), p, node));
    if ((fn & 1) === 0) while (fn !== 0 && (fn & 1) === 0) { fn >>= 1; sn >>= 1; }
  } else {
    node = await H(cat(Uint8Array.of(0x01), node, p));
  }
  fn >>= 1; sn >>= 1;
  console.log('level', hex(node));
}
console.log('inclusion proven:', sn === 0 && hex(node) === root);   // ${fold ? fold.verified : '?'}`}
                />
              </Surface>
            </div>
          ) : null}

          {/* ————————————————————————————————— 4 · THE LIMITS */}
          {stage === 3 ? (
            <div className="space-y-4">
              <Surface glow="qualified">
                <div className="flex items-center gap-2">
                  <FileTerminal className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-white">What none of this proves</span>
                </div>
                <ul className="mt-4 space-y-3.5 text-[12.5px] leading-relaxed text-slate-400">
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-slate-200">Not that the claim is true in the world.</strong>{' '}
                      Integrity and inclusion say a record exists, has not been edited, and sits in a log. A signed,
                      included, perfectly-folded warrant can still be wrong — it can rest on a source that was mistaken,
                      or on reasoning that was lazy. Cryptography protects the record. It does not audit reality.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-slate-200">Legacy HMAC seals verify server-side only.</strong>{' '}
                      An HMAC key cannot be published without becoming a forging key, so for those warrants &ldquo;valid&rdquo;
                      means <em>we say so</em>. Only <span className="font-mono text-[11px]">Ed25519</span> seals are
                      publicly checkable, and the v2 seal signs a message derived from access-controlled content, so a
                      stranger cannot rebuild it. The newer <em>public seal</em> can be rebuilt and checked in your
                      browser — but it commits to <em>hashes</em> of the content, so it proves those hashes are the ones
                      we signed, never what the content says (stage 2 runs it and states the boundary).
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-slate-200">Consistency between tree heads is a separate proof.</strong>{' '}
                      Inclusion says &ldquo;this leaf is in this tree&rdquo;. It does not say the log never rewrote its
                      history. That needs an RFC 6962 consistency proof between successive heads, which this version
                      publishes chain links for but not proofs of —{' '}
                      <Link to="/registry" className="text-[#7DD3FC] hover:underline">see the transparency log</Link> and{' '}
                      <Link to="/warrant-verifier" className="text-[#7DD3FC] hover:underline">the verifier spec</Link>.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-slate-200">A self-signed key document is not key authenticity.</strong>{' '}
                      It proves transport integrity. Anchor first-fetch trust in the domain and in the log&apos;s history,
                      and re-check the key id across time — a key that quietly changes is the thing to watch for.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    <span>
                      <strong className="font-medium text-slate-200">A small log proves less than a large one.</strong>{' '}
                      {registry?.count != null
                        ? `This listing window holds ${registry.count} warrant${registry.count === 1 ? '' : 's'}.`
                        : 'The size of this listing window is not published right now.'}{' '}
                      Inclusion in a small, young log is a weaker guarantee against selective omission than inclusion in a
                      large, widely-witnessed one. We would rather you knew the number than felt reassured by a badge.
                    </span>
                  </li>
                </ul>
              </Surface>

              <Surface>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-white">Where to take this next</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { to: '/registry', label: 'The transparency log', hint: 'every warrant, in order' },
                    { to: '/warrant-spec', label: 'Warrant spec', hint: 'the exact payload shape' },
                    { to: '/warrant-verifier', label: 'Verifier spec', hint: 'reimplement this check' },
                  ].map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
                    >
                      <div className="text-[12px] font-medium text-slate-200">{l.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{l.hint}</div>
                    </Link>
                  ))}
                </div>
              </Surface>

              <StateLegend title="What every badge on this page means" />
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}
