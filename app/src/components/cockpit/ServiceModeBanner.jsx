import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, TriangleAlert, History, RefreshCw, Loader2, Radio } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { stateFor, transition, TEXT } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';

// SERVICE MODE — the header state of the whole cockpit.
//
// Source: driftAlert { op: 'mode' } → { mode, since, reason, transitions[] }.
// Nothing on this banner is inferred. If the endpoint does not publish a field,
// the field says it was not published rather than showing a comfortable default.
//
// Two honesty rules are load-bearing here:
//   1. A mode string this file does not recognise is NOT treated as normal. It is
//      surfaced verbatim in the `unknown` state and it still dominates the page —
//      failing loud is the only safe direction for a service-health banner.
//   2. `mode_read_error` is rendered as its own block, at full prominence, whether
//      it arrives as a field, as the mode itself, or as a transport failure. A
//      health banner that swallows its own read error is worse than no banner.

const invoke = async (fn, body) => {
  const res = await base44.functions.invoke(fn, body);
  return res?.data ?? res;
};

// severity drives prominence only — never a verdict on its own.
//   calm  → quiet card, no glow, no ring
//   alert → dominates: ring, glow, larger type, the reason promoted to headline
const MODES = {
  normal: { state: 'supported', label: 'Normal service', severity: 'calm', blurb: 'Full verification service. No degradation is declared.' },
  healthy: { state: 'supported', label: 'Normal service', severity: 'calm', blurb: 'Full verification service. No degradation is declared.' },
  ok: { state: 'supported', label: 'Normal service', severity: 'calm', blurb: 'Full verification service. No degradation is declared.' },
  advisory: { state: 'qualified', label: 'Advisory mode', severity: 'alert', blurb: 'Verdicts are still issued, but they do not gate anything downstream.' },
  degraded: { state: 'contested', label: 'Degraded service', severity: 'alert', blurb: 'Some part of the pipeline is not performing to its measured baseline.' },
  limited: { state: 'contested', label: 'Limited service', severity: 'alert', blurb: 'The service is deliberately running below full capability.' },
  maintenance: { state: 'stale', label: 'Maintenance', severity: 'alert', blurb: 'Planned work is in progress. Results may lag the live record.' },
  emergency: { state: 'unsupported', label: 'Emergency mode', severity: 'alert', blurb: 'The service has escalated itself. Treat every verdict as provisional.' },
  kill_switch: { state: 'unsupported', label: 'Kill switch engaged', severity: 'alert', blurb: 'Verification is halted on purpose. Nothing is being promoted.' },
  halted: { state: 'unsupported', label: 'Halted', severity: 'alert', blurb: 'Verification is stopped. Nothing is being promoted.' },
  offline: { state: 'unsupported', label: 'Offline', severity: 'alert', blurb: 'The verification path is not serving.' },
};

function modeToken(raw) {
  if (raw == null || raw === '') {
    return { state: 'unknown', label: 'No mode published', severity: 'alert', blurb: 'The endpoint answered without naming a mode. That is a gap, not a green light.' };
  }
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (MODES[key]) return MODES[key];
  return {
    state: 'unknown',
    label: `Unrecognised mode · ${String(raw)}`,
    severity: 'alert',
    blurb: 'This cockpit does not know what this mode means, so it will not tell you it is fine. The raw value is shown exactly as the service published it.',
  };
}

function fmtAbsolute(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

function fmtAgo(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The transitions array's exact shape is not contracted, so read it defensively and
// show the raw row when nothing recognisable is in it. Never drop a record silently.
function readTransition(t, i) {
  if (t == null) return { key: i, raw: 'null' };
  if (typeof t === 'string') return { key: i, to: t };
  return {
    key: t.id || t.transition_id || `${i}`,
    to: t.to ?? t.to_mode ?? t.mode ?? t.new_mode ?? null,
    from: t.from ?? t.from_mode ?? t.previous_mode ?? t.old_mode ?? null,
    at: t.at ?? t.since ?? t.changed_at ?? t.timestamp ?? t.created_date ?? t.created_at ?? null,
    reason: t.reason ?? t.note ?? t.summary ?? t.detail ?? null,
    raw: null,
    rest: t,
  };
}

function TransitionRow({ row, reduced, index }) {
  const token = row.to ? modeToken(row.to) : { state: 'unknown', label: 'Mode not named' };
  const known = row.to || row.from || row.at || row.reason;
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...transition('base', reduced), delay: reduced ? 0 : Math.min(index * 0.04, 0.24) }}
      className="relative pl-6"
    >
      <span
        aria-hidden="true"
        className="absolute left-[7px] top-[9px] h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-[#0B0F16]"
        style={{ background: stateFor(token.state).hex }}
      />
      <div className="flex flex-wrap items-center gap-2 py-1">
        <EpistemicBadge state={token.state} size="sm" label={row.to ? String(row.to) : 'mode not named'} />
        {row.from ? (
          <span className="text-[11px] text-slate-500">
            from <span className="font-mono text-slate-400">{String(row.from)}</span>
          </span>
        ) : null}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">
          {row.at ? `${fmtAbsolute(row.at)} · ${fmtAgo(row.at)}` : 'no timestamp published'}
        </span>
      </div>
      {row.reason ? (
        <p className="pb-1.5 text-[11.5px] leading-relaxed text-slate-400">{String(row.reason)}</p>
      ) : (
        <p className="pb-1.5 text-[11px] text-slate-600">No reason published for this transition.</p>
      )}
      {!known && row.rest ? (
        <pre className="mb-2 overflow-x-auto rounded-lg bg-black/30 p-2 font-mono text-[10px] text-slate-500">
          {JSON.stringify(row.rest)}
        </pre>
      ) : null}
    </motion.li>
  );
}

export default function ServiceModeBanner({ tick = 0, onLoaded, onSeverity }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState(null);

  // Callbacks live in refs so an unstable parent prop can never turn `load` into a
  // new function every render — that is how auto-refresh becomes an infinite loop.
  const loadedRef = useRef(onLoaded);
  const severityRef = useRef(onSeverity);
  loadedRef.current = onLoaded;
  severityRef.current = onSeverity;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await invoke('driftAlert', { op: 'mode' });
      setData(d || null);
      setError(null);
    } catch (e) {
      setData(null);
      setError(e?.response?.data?.error || e?.message || 'driftAlert did not answer.');
    } finally {
      setAt(Date.now());
      setLoading(false);
      if (loadedRef.current) loadedRef.current();
    }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  // A read error is its own visible state — it is never allowed to read as "normal".
  const readError = data?.mode_read_error
    || (data && String(data.mode || '').toLowerCase() === 'mode_read_error' ? 'The service reported its mode as mode_read_error.' : null)
    || (error ? `The mode endpoint could not be read: ${error}` : null);

  const token = error ? modeToken(null) : modeToken(data?.mode);
  const severity = readError ? 'alert' : token.severity;
  const dominant = severity !== 'calm';
  const hex = stateFor(token.state).hex;

  useEffect(() => {
    const settled = !(loading && !data && !error);
    if (severityRef.current) severityRef.current(settled ? severity : 'calm');
  }, [severity, loading, data, error]);

  const transitions = Array.isArray(data?.transitions) ? data.transitions : [];

  return (
    <Surface
      glow={dominant ? token.state : false}
      className={cn('p-0 overflow-hidden', dominant && 'border-transparent')}
      style={dominant ? { boxShadow: `0 0 0 1px ${hex}55, 0 24px 60px -40px ${hex}` } : undefined}
    >
      {/* The state rail: a degraded mode paints the full left edge. */}
      <div className="flex">
        <span aria-hidden="true" className="w-1 shrink-0" style={{ background: dominant ? hex : 'transparent' }} />
        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Service mode
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <EpistemicBadge state={token.state} size="lg" label={token.label} />
                {data?.mode ? (
                  <span className="text-[11.5px] text-slate-500">
                    reported as <span className="font-mono text-slate-300">{String(data.mode)}</span>
                  </span>
                ) : null}
              </div>
              <p
                className={cn('mt-2 max-w-2xl leading-relaxed text-slate-400', dominant ? 'text-[13px]' : 'text-[12px]')}
              >
                {token.blurb}
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">In this mode since</div>
                <div className="mt-1 text-[12px] tabular-nums text-slate-300">
                  {data?.since ? fmtAbsolute(data.since) : 'not published'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {data?.since ? fmtAgo(data.since) : 'no start time in the payload'}
                </div>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] text-slate-300 transition-colors hover:border-white/30 hover:bg-white/[0.07] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                aria-label="Re-read the service mode"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                Re-read
              </button>
            </div>
          </div>

          {/* The declared reason, promoted to headline size when the mode is not calm. */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Declared reason</div>
            {data?.reason ? (
              <p className={cn('mt-1.5 leading-relaxed', dominant ? 'text-[13.5px] text-slate-200' : 'text-[12px] text-slate-400')}>
                {String(data.reason)}
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-slate-500">
                No reason was published with this mode. The mode is the service&apos;s claim; the reason is missing from it.
              </p>
            )}
          </div>

          {/* mode_read_error — always visible, never folded into the mode above. */}
          {readError ? (
            <div
              className="mt-3 rounded-xl border p-3"
              style={{ borderColor: `${stateFor('unsupported').hex}44`, background: `${stateFor('unsupported').hex}0F` }}
              role="alert"
            >
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: stateFor('unsupported').hex }} aria-hidden="true" />
                <div>
                  <div className="text-[12px] font-medium text-slate-100">Mode read error</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{String(readError)}</p>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    While this stands, treat the mode above as unread — not as normal. Nothing else on this page depends
                    on it, so the rest of the cockpit is still true.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Transitions */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> Mode transitions
              </div>
              <span className="text-[11px] text-slate-500">
                {transitions.length} published{at ? ` · read ${new Date(at).toLocaleTimeString()}` : ''}
              </span>
            </div>

            {loading && !data && !error ? (
              <p className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading <span className="font-mono">driftAlert · op=mode</span>…
              </p>
            ) : transitions.length === 0 ? (
              <HonestEmpty
                className="mt-3"
                title="No mode transitions published"
                reason={
                  error
                    ? 'The mode endpoint could not be read at all, so its transition history is unknown — not empty.'
                    : 'The service published an empty transition list. Either it has never changed mode, or it does not retain that history — this page cannot tell those apart and will not guess.'
                }
                state="unknown"
                icon={Activity}
                align="left"
              />
            ) : (
              <ol className="relative mt-3 space-y-1 border-l border-white/10 pl-1.5" role="list">
                {transitions.map((t, i) => (
                  <TransitionRow key={readTransition(t, i).key} row={readTransition(t, i)} reduced={reduced} index={i} />
                ))}
              </ol>
            )}
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: TEXT.muted }}>
            Every field above comes from <span className="font-mono">driftAlert · op=mode</span>. Nothing is defaulted:
            an absent field says it is absent.
          </p>
        </div>
      </div>
    </Surface>
  );
}
