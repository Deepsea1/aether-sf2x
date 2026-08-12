import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Loader2, RefreshCw, FileWarning, Lock, ScanSearch } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { TEXT, FOCUS, stateFor } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';

// LEDGER INTEGRITY — the successor to LedgerIntegrityCard, with the same three checks
// and three upgrades it needed.
//
// Source: verifyLedgerIntegrity {} →
//   { status, entries_checked, broken, details[], pages_scanned, truncated,
//     hash_failures, signature_failures }
//   Unauthenticated callers get a clean 401.
//
// Kept from the original card: it recomputes content hashes, verifies Ed25519
// signatures, and walks previous_event_hash continuity — and it names WHICH of the
// three a broken row failed, because "broken" alone tells an operator nothing.
//
// Upgraded, because the original quietly overstated:
//   1. A truncated scan can no longer read as a clean bill of health. Zero broken rows
//      out of a partial scan is `qualified` — "holds, within the window scanned" — never
//      the green `supported` the old card printed either way.
//   2. A 401 is now `blocked` ("held back, not judged") with a way in, not a red error
//      string that looks like the chain failed.
//   3. hash / signature / chain failures are counted separately and shown separately.

const invoke = async (fn, body) => {
  const res = await base44.functions.invoke(fn, body);
  return res?.data ?? res;
};

/** Names the check(s) a row failed — content hash, signature, or chain link. */
function failedChecks(d) {
  const parts = [];
  if (d?.content_valid === false) parts.push('content hash');
  if (d?.signature_valid === false) parts.push('signature');
  if (d?.chain_valid === false) parts.push('chain link');
  return parts.join(' + ');
}

function Counter({ label, value, hint, color }) {
  const missing = value === null || value === undefined;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>{label}</div>
      {missing ? (
        <div className="mt-0.5 text-[12px] text-slate-500">not published</div>
      ) : (
        <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: color || '#E8EEF7' }}>{value}</div>
      )}
      {hint ? <div className="mt-0.5 text-[10px]" style={{ color: TEXT.muted }}>{hint}</div> : null}
    </div>
  );
}

export default function LedgerIntegrityPanel({ tick = 0, onLoaded }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [at, setAt] = useState(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const d = await invoke('verifyLedgerIntegrity', {});
      setResult(d || null);
      setErr(null);
    } catch (e) {
      const status = e?.response?.status ?? e?.status ?? null;
      setErr({
        status,
        message: e?.response?.data?.error || e?.message || 'The integrity check did not run.',
      });
      setResult(null);
    } finally {
      setAt(Date.now());
      setLoading(false);
      if (loadedRef.current) loadedRef.current();
    }
  }, []);

  useEffect(() => { check(); }, [check, tick]);

  const view = useMemo(() => {
    if (!result) return null;
    const checked = Number(result.entries_checked) || 0;
    const broken = Number(result.broken) || 0;
    const details = Array.isArray(result.details) ? result.details : [];
    const chainFailures = details.filter((d) => d?.chain_valid === false).length;
    const truncated = !!result.truncated;
    const intact = Math.max(0, checked - broken);

    // The verdict, stated exactly as strongly as the evidence allows.
    const state = broken > 0 ? 'unsupported' : truncated ? 'qualified' : checked === 0 ? 'unknown' : 'supported';
    const label = broken > 0
      ? `${broken} entr${broken === 1 ? 'y' : 'ies'} failed verification`
      : checked === 0
        ? 'Nothing has been checked'
        : truncated
          ? `Intact across the ${checked} entries scanned`
          : 'Whole chain intact';

    return {
      checked, broken, intact, details, truncated, state, label, chainFailures,
      hashFailures: result.hash_failures ?? null,
      signatureFailures: result.signature_failures ?? null,
      pagesScanned: result.pages_scanned ?? null,
      status: result.status || null,
    };
  }, [result]);

  const unauthorized = err?.status === 401 || /401|unauthor|not authenticated|sign in/i.test(err?.message || '');

  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Ledger integrity
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-slate-400">
            Three checks per audit entry: the content hash is recomputed, the Ed25519 signature is verified, and the
            link to the previous entry is walked. A row that fails says <em>which</em> of the three it failed.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {at ? <span className="text-[11px] text-slate-500">ran {new Date(at).toLocaleTimeString()}</span> : null}
          <button
            type="button"
            onClick={check}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] text-slate-300 transition-colors hover:border-white/30 hover:bg-white/[0.07] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Run check
          </button>
        </div>
      </div>

      {loading && !result && !err ? (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Recomputing hashes and walking the chain…
        </p>
      ) : unauthorized ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title="The ledger is access-controlled"
          reason="This check runs over your own audit chain, so it needs you signed in. It is held back, not failed — nothing here says anything about whether the chain is intact."
          state="blocked"
          icon={Lock}
          action={{ label: 'Sign in to run it', to: '/portal' }}
        />
      ) : err ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title="The integrity check did not run"
          reason={`${err.message}${err.status ? ` (HTTP ${err.status})` : ''} — so the chain's state is unknown. An unrun check is not a passing check.`}
          state="unknown"
          icon={ScanSearch}
          action={{ label: 'Try again', onClick: check }}
        />
      ) : result?.status === 'empty' || (view && view.checked === 0) ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title="No ledger entries to verify"
          reason="The audit chain is empty, so there is nothing to hash, sign-check or link. This will fill itself in the moment a verification is run."
          state="unknown"
          action={{ label: 'Run a verification', to: '/console' }}
        />
      ) : view ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <EpistemicBadge state={view.state} label={view.label} />
            {view.truncated ? (
              <span className="text-[11px] text-slate-500">
                partial scan{view.pagesScanned != null ? ` · ${view.pagesScanned} page${view.pagesScanned === 1 ? '' : 's'} read` : ''}
              </span>
            ) : view.pagesScanned != null ? (
              <span className="text-[11px] text-slate-500">{view.pagesScanned} page{view.pagesScanned === 1 ? '' : 's'} read</span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Counter label="Entries checked" value={view.checked} />
            <Counter label="Verified" value={view.intact} color={view.broken === 0 && !view.truncated ? stateFor('supported').hex : FOCUS} />
            <Counter label="Broken" value={view.broken} color={view.broken > 0 ? stateFor('unsupported').hex : undefined} />
            <Counter label="Hash failures" value={view.hashFailures} hint="content rehashed" color={view.hashFailures ? stateFor('unsupported').hex : undefined} />
            <Counter label="Signature failures" value={view.signatureFailures} hint="Ed25519" color={view.signatureFailures ? stateFor('unsupported').hex : undefined} />
            <Counter label="Chain-link failures" value={view.chainFailures} hint="from details[]" color={view.chainFailures ? stateFor('unsupported').hex : undefined} />
          </div>

          {view.truncated ? (
            <div
              className="mt-3 flex items-start gap-2 rounded-xl border p-3"
              style={{ borderColor: `${stateFor('qualified').hex}33`, background: `${stateFor('qualified').hex}0A` }}
            >
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: stateFor('qualified').hex }} aria-hidden="true" />
              <p className="text-[11.5px] leading-relaxed text-slate-300">
                <strong className="font-medium">This was a partial scan.</strong> Entries older than the {view.checked}{' '}
                most recent were not read, so this result covers a window, not the ledger. A clean window is not a clean
                ledger, and this panel will not print it as one.
              </p>
            </div>
          ) : null}

          {view.broken > 0 ? (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
                Failing entries ({view.details.length} reported)
              </div>
              <div className="mt-1.5 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {view.details.map((d, i) => {
                  const failed = failedChecks(d);
                  return (
                    <div
                      key={d?.event_id || i}
                      className="rounded-lg border p-2.5"
                      style={{ borderColor: `${stateFor('unsupported').hex}26`, background: `${stateFor('unsupported').hex}0A` }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px]" style={{ color: stateFor('unsupported').hex }}>
                          {d?.event_id || 'event id not published'}
                        </span>
                        <span className="text-[11px] text-slate-500">{d?.event_type || 'type not published'}</span>
                        {failed ? (
                          <EpistemicBadge state="unsupported" size="sm" label={`${failed} failed`} />
                        ) : (
                          <EpistemicBadge state="unknown" size="sm" label="which check failed was not published" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{d?.reason || 'No reason published for this failure.'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
              {view.truncated
                ? `Every one of the ${view.checked} entries scanned rehashed correctly, carried a valid signature, and linked to its predecessor.`
                : `Every entry rehashed correctly, carried a valid signature, and linked to its predecessor — ${view.checked} of ${view.checked}.`}
            </p>
          )}

          <p className="mt-3 border-t border-white/10 pt-3 text-[10.5px] leading-relaxed" style={{ color: TEXT.muted }}>
            Every number here comes from <span className="font-mono">verifyLedgerIntegrity</span>. Chain-link failures are
            counted from <span className="font-mono">details[]</span> rather than derived by subtraction, because one entry
            can fail more than one check. Want the same maths run in your own browser instead of ours?{' '}
            <Link to="/proof" className="hover:underline" style={{ color: FOCUS }}>Proof Theater</Link>.
          </p>
        </>
      ) : null}
    </Surface>
  );
}
