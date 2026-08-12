import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gauge as GaugeIcon, Loader2, ShieldQuestion, Ban, ListChecks, ScrollText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { FOCUS, TEXT, stateFor, transition } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';

// VERIFIER CAPABILITY — what has actually been MEASURED, per domain pack.
//
// Source: publishCalibration { op: 'capability_card', domain_pack_id } →
//   { domain_pack_id, card | null, enforcing: { allowed, reasons[] } }
// The op MUST travel in the body: a GET ?op= falls through to the admin default
// and 401s, so this panel never builds a query-string call.
//
// THE COLOUR DISCIPLINE HERE IS DELIBERATE. A measured rate is a measurement, not a
// verdict, so every gauge is drawn in the focus blue — a colour that is never a state.
// The only verdict on this panel is `enforcing`, and that comes from the server, not
// from this file comparing numbers to thresholds it invented.
//
// AND THE FRAMING: a LOCKED gate is the product working. The system refusing to
// hard-block on an unmeasured false-block rate is exactly the behaviour you are paying
// for. It is rendered as `qualified` — calm, limited, honest — never as an error.
// A gate that is locked because the card could not be FETCHED is a different thing
// entirely, and gets `unknown` plus a retry, so the two can never be confused.

const invoke = async (fn, body) => {
  const res = await base44.functions.invoke(fn, body);
  return res?.data ?? res;
};

const PACKS = ['general-verify', 'technical-docs@1.0'];

// The two bounds the gate publishes in prose. They are drawn as a marker, never as a
// pass/fail colour — the authoritative verdict is `enforcing.allowed` from the server.
const STATED_BOUNDS = {
  'false_block_rate_by_risk.high': 0.10,
  'false_block_rate_by_risk.critical': 0.05,
};

const METRICS = [
  { path: 'false_pass_rate_by_risk.low', label: 'False-pass · low risk', better: 'lower' },
  { path: 'false_pass_rate_by_risk.moderate', label: 'False-pass · moderate', better: 'lower' },
  { path: 'false_pass_rate_by_risk.high', label: 'False-pass · high', better: 'lower' },
  { path: 'false_pass_rate_by_risk.critical', label: 'False-pass · critical', better: 'lower' },
  { path: 'false_block_rate_by_risk.low', label: 'False-block · low risk', better: 'lower' },
  { path: 'false_block_rate_by_risk.moderate', label: 'False-block · moderate', better: 'lower' },
  { path: 'false_block_rate_by_risk.high', label: 'False-block · high', better: 'lower' },
  { path: 'false_block_rate_by_risk.critical', label: 'False-block · critical', better: 'lower' },
  { path: 'extraction_recall', label: 'Extraction recall', better: 'higher' },
  { path: 'evidence_alignment_rate', label: 'Evidence alignment', better: 'higher' },
  { path: 'citation_integrity_rate', label: 'Citation integrity', better: 'higher' },
];

function readPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

/** A measured rate, drawn to a full 0–100% scale so a small number reads as small. */
function Gauge({ metric, value, reduced }) {
  const bound = STATED_BOUNDS[metric.path] ?? null;
  const width = Math.max(0.6, Math.min(100, value * 100)); // a floor so 0.1% is still visible
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-slate-400">{metric.label}</span>
        <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: FOCUS }}>{pct(value)}</span>
      </div>
      <div
        className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`${metric.label}: ${pct(value)} measured on a 0 to 100 percent scale${bound != null ? `, stated gate bound ${pct(bound)}` : ''}`}
      >
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: FOCUS, opacity: 0.85 }}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${width}%` }}
          transition={transition('slow', reduced)}
        />
        {bound != null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-[-3px] w-[2px] rounded"
            style={{ left: `${bound * 100}%`, background: TEXT.secondary }}
            title={`Stated gate bound: ${pct(bound)}`}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px]" style={{ color: TEXT.muted }}>
        <span>{metric.better === 'lower' ? 'lower is better' : 'higher is better'}</span>
        {bound != null ? <span>stated bound {pct(bound)}</span> : <span>no published bound</span>}
      </div>
    </div>
  );
}

function PackCard({ packId, card, enforcing, fetchFailed, error, onRetry, reduced }) {
  const measured = [];
  const unmeasured = [];
  for (const m of METRICS) {
    const v = card ? readPath(card, m.path) : undefined;
    if (typeof v === 'number' && Number.isFinite(v)) measured.push({ metric: m, value: v });
    else unmeasured.push(m);
  }

  const limitations = Array.isArray(card?.known_limitations) ? card.known_limitations : [];
  const evaluated = Array.isArray(card?.evaluated_tasks) ? card.evaluated_tasks : [];
  const prohibited = Array.isArray(card?.prohibited_tasks) ? card.prohibited_tasks : [];
  const reasons = Array.isArray(enforcing?.reasons) ? enforcing.reasons : [];

  const expiresAt = card?.expires_at ? new Date(card.expires_at).getTime() : null;
  const expired = expiresAt != null && !Number.isNaN(expiresAt) && expiresAt < Date.now();

  // Three distinct gate states — never collapsed into one amber "not allowed".
  const gate = fetchFailed
    ? { state: 'unknown', label: 'Gate status unread', tone: 'error' }
    : enforcing?.allowed
      ? { state: 'supported', label: 'Enforcing unlocked', tone: 'open' }
      : { state: 'qualified', label: 'Advisory only — enforcement held back', tone: 'locked' };

  return (
    <Surface tone="raised" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-medium text-slate-100">{packId}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>domain pack</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {expired ? <EpistemicBadge state="stale" size="sm" label={`Card expired ${fmtDate(card.expires_at)}`} /> : null}
          <EpistemicBadge state={gate.state} label={gate.label} />
        </div>
      </div>

      {/* ————— the gate verdict, with every reason */}
      <div
        className="mt-3 rounded-xl border p-3"
        style={{ borderColor: `${stateFor(gate.state).hex}33`, background: `${stateFor(gate.state).hex}0D` }}
      >
        {gate.tone === 'locked' ? (
          <p className="text-[12px] leading-relaxed text-slate-200">
            <strong className="font-medium">This gate is locked, and that is the product working.</strong> The verifier
            will not hard-block anything until its false-block rate has actually been measured — because blocking on an
            unmeasured error rate is a guess wearing a uniform. Until then it advises, and every reason it is holding
            back is listed below.
          </p>
        ) : gate.tone === 'open' ? (
          <p className="text-[12px] leading-relaxed text-slate-200">
            <strong className="font-medium">Enforcement is unlocked for this pack.</strong> The server reports the
            §18.2 gate satisfied — measured false-block rate and measured extraction recall are both on file.
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-slate-200">
            <strong className="font-medium">The gate status could not be read.</strong> This is <em>not</em> a locked
            gate and <em>not</em> an open one — it is an unknown one. {error ? String(error) : null}
          </p>
        )}

        {reasons.length > 0 ? (
          <div className="mt-2.5 border-t border-white/10 pt-2.5">
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
              {gate.tone === 'open' ? `Gate notes (${reasons.length})` : `Every reason enforcement is held back (${reasons.length})`}
            </div>
            <ul className="mt-1.5 space-y-1" role="list">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-300">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: stateFor(gate.state).hex }} />
                  <span>{String(r)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : gate.tone === 'locked' ? (
          <p className="mt-2 text-[11px]" style={{ color: TEXT.muted }}>
            The server locked the gate without publishing a reason list. That absence is itself worth chasing.
          </p>
        ) : null}

        {fetchFailed ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            Try reading the capability card again
          </button>
        ) : null}
      </div>

      {/* ————— measured rates */}
      {measured.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
            Measured ({measured.length} of {METRICS.length})
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {measured.map(({ metric, value }) => (
              <Gauge key={metric.path} metric={metric} value={value} reduced={reduced} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ————— the honest gap: never a 0, never a dash */}
      {unmeasured.length > 0 && !fetchFailed ? (
        <HonestEmpty
          className="mt-4"
          align="left"
          title={
            measured.length === 0
              ? `Nothing is measured for ${packId} yet`
              : `${unmeasured.length} of ${METRICS.length} rates are not yet measured`
          }
          reason={
            limitations.length > 0
              ? `The card states its own limits: ${limitations.map((l) => String(l)).join(' · ')}`
              : card
                ? 'The capability card exists but publishes no value for these, and no limitation explaining why. An unmeasured rate is a gap in the evidence, not a score of zero.'
                : 'No capability card has been generated for this pack, so nothing has been measured at all. That is why enforcement stays advisory.'
          }
          state="unknown"
          icon={ShieldQuestion}
        >
          <ul className="mt-1 flex flex-wrap gap-1.5" role="list">
            {unmeasured.map((m) => (
              <li
                key={m.path}
                className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 font-mono text-[10px]"
                style={{ color: TEXT.muted }}
              >
                {m.path}
              </li>
            ))}
          </ul>
        </HonestEmpty>
      ) : null}

      {/* ————— scope: what it was evaluated on, what it must not touch */}
      {(evaluated.length > 0 || prohibited.length > 0) ? (
        <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
              <ListChecks className="h-3 w-3" aria-hidden="true" /> Evaluated on
            </div>
            {evaluated.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {evaluated.map((t, i) => (
                  <span key={i} className="rounded-full border border-white/12 px-2 py-0.5 text-[10.5px] text-slate-300">{String(t)}</span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px]" style={{ color: TEXT.muted }}>No evaluated task list published.</p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
              <Ban className="h-3 w-3" aria-hidden="true" /> Prohibited
            </div>
            {prohibited.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {prohibited.map((t, i) => (
                  <span
                    key={i}
                    className="rounded-full border px-2 py-0.5 text-[10.5px]"
                    style={{ borderColor: `${stateFor('revoked').hex}44`, color: stateFor('revoked').hex }}
                  >
                    {String(t)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px]" style={{ color: TEXT.muted }}>No prohibited task list published.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* ————— known limitations, in full */}
      {limitations.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
            <ScrollText className="h-3 w-3" aria-hidden="true" /> Known limitations ({limitations.length})
          </div>
          <ul className="mt-1.5 space-y-1" role="list">
            {limitations.map((l, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-400">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                <span>{String(l)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ————— provenance of the card itself */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[10.5px]" style={{ color: TEXT.muted }}>
        <span>verifier <span className="font-mono text-slate-400">{card?.verifier_version || 'not published'}</span></span>
        <span>valid from {fmtDate(card?.valid_from) || 'not published'}</span>
        <span>reviewed {fmtDate(card?.reviewed_at) || 'not published'}</span>
        <span>expires {fmtDate(card?.expires_at) || 'not published'}</span>
      </div>
    </Surface>
  );
}

export default function CapabilityPanel({ tick = 0, onLoaded }) {
  const reduced = useReducedMotion();
  const [packs, setPacks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  const loadOne = useCallback(async (packId) => {
    try {
      const d = await invoke('publishCalibration', { op: 'capability_card', domain_pack_id: packId });
      return {
        packId,
        card: d?.card || null,
        enforcing: d?.enforcing || null,
        fetchFailed: !d,
        error: d ? null : 'The endpoint answered with an empty body.',
      };
    } catch (e) {
      return {
        packId,
        card: null,
        enforcing: null,
        fetchFailed: true,
        error: e?.response?.data?.error || e?.message || 'publishCalibration did not answer.',
      };
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(PACKS.map(loadOne));
    setPacks(results);
    setAt(Date.now());
    setLoading(false);
    if (loadedRef.current) loadedRef.current();
  }, [loadOne]);

  useEffect(() => { load(); }, [load, tick]);

  const retryOne = useCallback(async (packId) => {
    const next = await loadOne(packId);
    setPacks((prev) => (prev || []).map((p) => (p.packId === packId ? next : p)));
  }, [loadOne]);

  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <GaugeIcon className="h-3.5 w-3.5" aria-hidden="true" /> Verifier capability
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-slate-400">
            What the verifier has <em>measured</em> it can do, per domain pack — and whether that evidence is strong
            enough to let it block anything. Enforcement unlocks only on a measured false-block rate and measured
            extraction recall. Unmeasured fails closed to advisory, on purpose.
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-500">
          {at ? `read ${new Date(at).toLocaleTimeString()}` : ''}
        </span>
      </div>

      {loading && !packs ? (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading{' '}
          <span className="font-mono">publishCalibration · op=capability_card</span>…
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {(packs || []).map((p) => (
            <PackCard
              key={p.packId}
              packId={p.packId}
              card={p.card}
              enforcing={p.enforcing}
              fetchFailed={p.fetchFailed}
              error={p.error}
              onRetry={() => retryOne(p.packId)}
              reduced={reduced}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: TEXT.muted }}>
        Gauges are drawn in the focus blue, which is never an epistemic state — a measurement is not a verdict. The only
        verdict on this panel is the enforcing gate, and it is the server&apos;s, not this page&apos;s.
      </p>
    </Surface>
  );
}
