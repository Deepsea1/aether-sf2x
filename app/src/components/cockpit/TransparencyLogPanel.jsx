import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Boxes, Loader2, GitCommitVertical, Link2Off, Link2, TriangleAlert, Play, ScanSearch,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { TEXT, FOCUS, stateFor, transition } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';
import HashChip from '@/components/proof/HashChip';

// THE TRANSPARENCY LOG — the signed head, the chain behind it, and a consistency proof
// you can ask for on demand.
//
// Sources:
//   warrantRegistry ?op=checkpoint                       → { head, recent_heads[], note }
//   warrantRegistry { op:'consistency', from_tree_size, to_tree_size }
//                                                        → { from, to, proof[], algorithm, verification_note }
//   errors: 400 (fewer than two heads, carries available_tree_sizes[]),
//           409 FORK EVIDENCE (conflicting_roots[]), 409 TAMPER EVIDENCE, 503 (truncated scan)
//
// THE HISTORY IS SHOWN, NOT TIDIED. Four heads were committed at tree_size 500 while the
// log was still signing a sliding newest-500 window, before a pager bug was fixed. They
// are wrong, they are permanent, and they are displayed — marked superseded, with the
// reason attached. An append-only log that quietly dropped its own bad commitments would
// not be an append-only log. A consistency proof against one of them FAILS, and that
// failure is the correct answer: it is the log telling the truth about its own past.
//
// The honest boundary, stated on the panel: the proof below is COMPUTED BY THE SERVER and
// displayed here. This page does not re-fold it. The Proof Theater is where your own
// browser does the maths.

const invoke = async (fn, body) => {
  const res = await base44.functions.invoke(fn, body);
  return res?.data ?? res;
};

/** The four known-defective commitments: signed over a sliding newest-500 window. */
const DEFECTIVE_TREE_SIZE = 500;
const isDefective = (h) => Number(h?.tree_size) === DEFECTIVE_TREE_SIZE;

function fmtWhen(v) {
  if (!v) return 'not published';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

/** Pull whatever the server actually said out of an SDK error, without inventing shape. */
function readError(e) {
  const payload = e?.response?.data ?? e?.data ?? null;
  const status = e?.response?.status ?? e?.status ?? null;
  const message = payload?.error || payload?.message || e?.message || 'The registry did not answer.';
  return {
    status,
    message: String(message),
    availableTreeSizes: Array.isArray(payload?.available_tree_sizes) ? payload.available_tree_sizes : null,
    conflictingRoots: Array.isArray(payload?.conflicting_roots) ? payload.conflicting_roots : null,
    payload,
  };
}

/** Map an error onto a state honestly: evidence of a fork is contested, tamper is unsupported. */
function verdictForError(err) {
  const text = `${err.message} ${JSON.stringify(err.payload || {})}`.toUpperCase();
  if (text.includes('TAMPER')) {
    return { state: 'unsupported', label: 'TAMPER EVIDENCE', blurb: 'The registry reports evidence that the log was altered, not merely inconsistent. This is the most serious answer this endpoint can give.' };
  }
  if (text.includes('FORK')) {
    return { state: 'contested', label: 'FORK EVIDENCE', blurb: 'Two different roots were committed for the same tree size. The log disagrees with itself, and the conflicting roots are printed below.' };
  }
  if (err.status === 400) {
    return { state: 'unknown', label: 'Not provable yet', blurb: 'A consistency proof needs two heads. The registry listed the sizes it can actually work with — pick from those.' };
  }
  if (err.status === 503) {
    return { state: 'unknown', label: 'Scan truncated', blurb: 'The registry could not scan far enough to build the proof. Nothing is proven and nothing is disproven — try again.' };
  }
  if (err.status === 409) {
    return { state: 'contested', label: 'Conflict reported', blurb: 'The registry refused the pair and reported a conflict.' };
  }
  return { state: 'unknown', label: `Proof not returned${err.status ? ` · HTTP ${err.status}` : ''}`, blurb: 'No verdict either way — the request did not complete.' };
}

function HeadRow({ head, next, index, reduced }) {
  const defective = isDefective(head);
  // prev_root should equal the merkle_root of the head below it in the chain.
  const linked = next ? head?.prev_root && next?.merkle_root && head.prev_root === next.merkle_root : null;
  const linkState = linked === null ? null : linked ? 'supported' : (defective || isDefective(next) ? 'stale' : 'contested');

  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...transition('base', reduced), delay: reduced ? 0 : Math.min(index * 0.05, 0.3) }}
      className="relative"
    >
      <div
        className={cn('rounded-xl border p-3', defective ? 'border-white/10' : 'border-white/[0.08]')}
        style={defective ? { background: `${stateFor('stale').hex}0A` } : { background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitCommitVertical className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="font-mono text-[12px] font-semibold tabular-nums text-slate-100">
              tree_size {head?.tree_size ?? 'not published'}
            </span>
            {defective ? (
              <EpistemicBadge state="stale" size="sm" label="Superseded · defective window" />
            ) : (
              <EpistemicBadge state="supported" size="sm" label="Whole-log commitment" />
            )}
          </div>
          <span className="text-[10.5px] tabular-nums" style={{ color: TEXT.muted }}>{fmtWhen(head?.created_date)}</span>
        </div>

        {defective ? (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: stateFor('stale').hex }}>
            This head committed to a sliding <em>newest-500</em> window rather than the whole log — a pager bug that has
            since been fixed. It is kept because the log is append-only: deleting the record of a defect would be the
            defect. A consistency proof against it is expected to fail.
          </p>
        ) : null}

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <HashChip label="merkle_root" value={head?.merkle_root} tone="theirs" truncate={14} />
          <HashChip label="prev_root (chain link)" value={head?.prev_root} tone="theirs" truncate={14} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: TEXT.muted }}>
          <span>head_id <span className="font-mono">{head?.head_id || 'not published'}</span></span>
          <span>key_id <span className="font-mono">{head?.key_id || 'not published'}</span></span>
          <span>signed_head {head?.signed_head ? 'published' : 'not published'}</span>
        </div>
      </div>

      {next ? (
        <div className="flex items-center gap-2 py-1.5 pl-3">
          <span aria-hidden="true" className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
          {linked ? (
            <span className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: stateFor('supported').hex }}>
              <Link2 className="h-3 w-3" aria-hidden="true" /> prev_root matches the head below
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: stateFor(linkState || 'unknown').hex }}>
              <Link2Off className="h-3 w-3" aria-hidden="true" />
              {defective || isDefective(next)
                ? 'no chain link across the defective window — expected, and shown rather than hidden'
                : 'prev_root does NOT match the head below — an unexplained break in the chain'}
            </span>
          )}
        </div>
      ) : null}
    </motion.li>
  );
}

export default function TransparencyLogPanel({ tick = 0, onLoaded }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [proving, setProving] = useState(false);
  const [proof, setProof] = useState(null);
  const [proofError, setProofError] = useState(null);

  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await invoke('warrantRegistry', { op: 'checkpoint' });
      setData(d || null);
      setError(null);
    } catch (e) {
      setData(null);
      setError(readError(e));
    } finally {
      setAt(Date.now());
      setLoading(false);
      if (loadedRef.current) loadedRef.current();
    }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  const head = data?.head || null;

  // Every head we know about, newest first, de-duplicated by head_id+tree_size.
  const heads = useMemo(() => {
    const list = [];
    const seen = new Set();
    const push = (h) => {
      if (!h) return;
      const k = `${h.head_id || ''}:${h.tree_size}:${h.merkle_root || ''}`;
      if (seen.has(k)) return;
      seen.add(k);
      list.push(h);
    };
    push(head);
    (Array.isArray(data?.recent_heads) ? data.recent_heads : []).forEach(push);
    return list.sort((a, b) => (Number(b?.tree_size) || 0) - (Number(a?.tree_size) || 0));
  }, [data, head]);

  const validSizes = useMemo(
    () => Array.from(new Set(heads.filter((h) => !isDefective(h)).map((h) => Number(h.tree_size)).filter(Number.isFinite)))
      .sort((a, b) => b - a),
    [heads],
  );
  const allSizes = useMemo(
    () => Array.from(new Set(heads.map((h) => Number(h.tree_size)).filter(Number.isFinite))).sort((a, b) => b - a),
    [heads],
  );
  const firstValid = validSizes.length ? Math.min(...validSizes) : null;

  // Default the picker to the two newest VALID heads — the pair that should succeed.
  useEffect(() => {
    if (from !== '' || to !== '') return;
    if (validSizes.length >= 2) {
      setTo(String(validSizes[0]));
      setFrom(String(validSizes[1]));
    } else if (allSizes.length >= 2) {
      setTo(String(allSizes[0]));
      setFrom(String(allSizes[1]));
    }
  }, [validSizes, allSizes, from, to]);

  const prove = useCallback(async () => {
    const f = Number(from);
    const t = Number(to);
    if (!Number.isFinite(f) || !Number.isFinite(t)) return;
    setProving(true);
    setProof(null);
    setProofError(null);
    try {
      const d = await invoke('warrantRegistry', { op: 'consistency', from_tree_size: f, to_tree_size: t });
      if (d?.error) setProofError(readError({ response: { data: d, status: d.status ?? null } }));
      else setProof(d || null);
    } catch (e) {
      setProofError(readError(e));
    } finally {
      setProving(false);
    }
  }, [from, to]);

  const pickedDefective = [Number(from), Number(to)].some((n) => n === DEFECTIVE_TREE_SIZE);

  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <Boxes className="h-3.5 w-3.5" aria-hidden="true" /> Transparency log
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-slate-400">
            The signed commitments this log has made about itself, newest first — including the ones it got wrong.
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-500">{at ? `read ${new Date(at).toLocaleTimeString()}` : ''}</span>
      </div>

      {loading && !data && !error ? (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading{' '}
          <span className="font-mono">warrantRegistry ?op=checkpoint</span>…
        </p>
      ) : error ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title="The checkpoint could not be read"
          reason={`${error.message}${error.status ? ` (HTTP ${error.status})` : ''} — so the head, the chain and any proof against them are all unknown right now. Unknown is not "fine".`}
          state="unknown"
          icon={ScanSearch}
          action={{ label: 'Try again', onClick: load }}
        />
      ) : !head && heads.length === 0 ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title="No signed tree head has been published"
          reason="Without a head, inclusion can only be proven against a root the server recomputes per request — not against a durable, dated commitment. There is nothing here to be reassured by yet."
          state="unknown"
          action={{ label: 'Open the Proof Theater', to: '/proof' }}
        />
      ) : (
        <>
          {/* ————— the current signed head */}
          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: `${FOCUS}33`, background: `${FOCUS}0A` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Current signed head</span>
              {head ? (
                <EpistemicBadge
                  state={isDefective(head) ? 'stale' : 'qualified'}
                  size="sm"
                  label={isDefective(head) ? 'Head is one of the defective four' : 'Signed by the server · verify it yourself in the Proof Theater'}
                />
              ) : (
                <EpistemicBadge state="unknown" size="sm" label="No head in the payload" />
              )}
            </div>
            {head ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Tree size</div>
                    <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-100">{head.tree_size ?? 'not published'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Key id</div>
                    <div className="mt-0.5 break-all font-mono text-[12px] text-slate-300">{head.key_id || 'not published'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Created</div>
                    <div className="mt-0.5 text-[12px] tabular-nums text-slate-300">{fmtWhen(head.created_date)}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <HashChip label="merkle_root" value={head.merkle_root} tone="theirs" />
                  <HashChip label="prev_root" value={head.prev_root} tone="theirs" />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <HashChip label="payload_hash" value={head.payload_hash} tone="theirs" truncate={16} />
                  <HashChip label="signed_head" value={head.signed_head} tone="theirs" truncate={16} />
                </div>
              </>
            ) : null}
            {data?.note ? (
              <p className="mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-relaxed" style={{ color: TEXT.muted }}>
                Registry note: {String(data.note)}
              </p>
            ) : null}
          </div>

          {/* ————— the chain, including the defective heads */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
                Head chain ({heads.length} published)
              </div>
              {firstValid != null ? (
                <span className="text-[11px] text-slate-500">
                  whole-log commitments begin at <span className="font-mono tabular-nums text-slate-300">tree_size {firstValid}</span>
                </span>
              ) : null}
            </div>
            <ol className="mt-2 space-y-0" role="list">
              {heads.map((h, i) => (
                <HeadRow key={`${h.head_id || 'head'}-${h.tree_size}-${i}`} head={h} next={heads[i + 1] || null} index={i} reduced={reduced} />
              ))}
            </ol>
          </div>

          {/* ————— consistency proof */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Consistency proof</div>
            <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-slate-400">
              Inclusion says a leaf is in a tree. Consistency says the tree never rewrote its history. Pick two heads and
              ask the registry to prove one grew from the other — including a defective one, if you want to watch it
              fail honestly.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>from tree_size</span>
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#080B11] px-2.5 py-1.5 font-mono text-[12px] text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                >
                  {allSizes.length === 0 ? <option value="">no heads</option> : null}
                  {allSizes.map((s) => (
                    <option key={s} value={s}>{s}{s === DEFECTIVE_TREE_SIZE ? ' (defective)' : ''}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>to tree_size</span>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#080B11] px-2.5 py-1.5 font-mono text-[12px] text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                >
                  {allSizes.length === 0 ? <option value="">no heads</option> : null}
                  {allSizes.map((s) => (
                    <option key={s} value={s}>{s}{s === DEFECTIVE_TREE_SIZE ? ' (defective)' : ''}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={prove}
                disabled={proving || allSizes.length < 2}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[12px] font-medium text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
              >
                {proving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                Prove consistency
              </button>
            </div>

            {allSizes.length < 2 ? (
              <p className="mt-2 text-[11px]" style={{ color: TEXT.muted }}>
                Fewer than two heads are published, so there is no pair to prove anything between.
              </p>
            ) : null}

            {pickedDefective ? (
              <div
                className="mt-3 flex items-start gap-2 rounded-xl border p-3"
                style={{ borderColor: `${stateFor('stale').hex}3A`, background: `${stateFor('stale').hex}0D` }}
              >
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: stateFor('stale').hex }} aria-hidden="true" />
                <p className="text-[11.5px] leading-relaxed text-slate-300">
                  You have selected <span className="font-mono">tree_size {DEFECTIVE_TREE_SIZE}</span> — one of the four
                  defective sliding-window commitments. This proof is <strong className="font-medium">expected to fail</strong>,
                  and the failure is the correct result: the log is telling you those roots never committed to the whole
                  tree. Run it anyway; that is the point of keeping them.
                </p>
              </div>
            ) : null}

            {proofError ? (() => {
              const v = verdictForError(proofError);
              return (
                <div
                  className="mt-3 rounded-xl border p-3"
                  style={{ borderColor: `${stateFor(v.state).hex}3A`, background: `${stateFor(v.state).hex}0D` }}
                  role="status"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <EpistemicBadge state={v.state} label={v.label} />
                    {proofError.status ? <span className="text-[11px] text-slate-500">HTTP {proofError.status}</span> : null}
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{v.blurb}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-slate-400">{proofError.message}</p>

                  {proofError.availableTreeSizes ? (
                    <div className="mt-2.5">
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Sizes the registry can prove between</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {proofError.availableTreeSizes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setTo(String(s))}
                            className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10.5px] text-slate-300 transition-colors hover:border-white/35 hover:bg-white/[0.06]"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {proofError.conflictingRoots ? (
                    <div className="mt-2.5">
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Conflicting roots</div>
                      <div className="mt-1.5 grid gap-2">
                        {proofError.conflictingRoots.map((r, i) => (
                          <HashChip key={i} label={`root ${i + 1}`} value={typeof r === 'string' ? r : JSON.stringify(r)} tone="mismatch" truncate={20} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })() : null}

            {proof ? (
              <div
                className="mt-3 rounded-xl border p-3"
                style={{ borderColor: `${stateFor('qualified').hex}33`, background: `${stateFor('qualified').hex}0A` }}
                role="status"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <EpistemicBadge state="qualified" label="Proof issued — by the server, not recomputed here" />
                  <span className="font-mono text-[11px] text-slate-500">{proof.algorithm || 'algorithm not published'}</span>
                  <span className="text-[11px] text-slate-500">
                    {Array.isArray(proof.proof) ? `${proof.proof.length} node${proof.proof.length === 1 ? '' : 's'}` : 'no proof array published'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>from · tree_size {proof.from?.tree_size ?? '?'}</div>
                    <div className="mt-1.5 space-y-1.5">
                      <HashChip label="root" value={proof.from?.root} tone="theirs" truncate={14} />
                      <div className="text-[10px]" style={{ color: TEXT.muted }}>key_id <span className="font-mono">{proof.from?.key_id || 'not published'}</span></div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>to · tree_size {proof.to?.tree_size ?? '?'}</div>
                    <div className="mt-1.5 space-y-1.5">
                      <HashChip label="root" value={proof.to?.root} tone="theirs" truncate={14} />
                      <div className="text-[10px]" style={{ color: TEXT.muted }}>key_id <span className="font-mono">{proof.to?.key_id || 'not published'}</span></div>
                    </div>
                  </div>
                </div>

                {Array.isArray(proof.proof) && proof.proof.length > 0 ? (
                  <div className="mt-2.5">
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Proof path</div>
                    <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
                      {proof.proof.map((p, i) => `${String(i).padStart(2, '0')}  ${p}`).join('\n')}
                    </pre>
                  </div>
                ) : null}

                {proof.verification_note ? (
                  <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: TEXT.muted }}>{String(proof.verification_note)}</p>
                ) : null}

                <p className="mt-2.5 border-t border-white/10 pt-2.5 text-[11px] leading-relaxed text-slate-400">
                  <strong className="font-medium text-slate-300">The honest boundary:</strong> this panel displays the
                  registry&apos;s proof. It does not re-fold it in your browser, so the verdict above is{' '}
                  <em>the server&apos;s</em>. Where your own machine does the maths is the{' '}
                  <Link to="/proof" className="hover:underline" style={{ color: FOCUS }}>Proof Theater</Link>.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </Surface>
  );
}
