import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio, Play, Square, KeyRound, TriangleAlert, Info, ChevronRight, RotateCcw, Zap,
} from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { normalizeState, TEXT, FOCUS, stateFor } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';
import StateLegend from '@/components/aether/StateLegend';
import PipelineRail from '@/components/live/PipelineRail';
import ClaimStream from '@/components/live/ClaimStream';
import VerdictSeal from '@/components/live/VerdictSeal';

// THE LIVE TRIBUNAL — watch a verification happen, then go check it yourself.
//
// TRANSPORT, verified against base44/functions/streamVerify/entry.ts:
//   POST, JSON body { text, domain, source }. SSE frames are written as
//   `data: ${JSON.stringify(obj)}\n\n` — one JSON object per frame, no `event:`
//   names, no ids. The stage vocabulary is exactly five plus an error:
//     {stage:'analyzing'}
//     {stage:'claims', count}
//     {stage:'claim', claim:{claim, supported, notes}}      · one per claim
//     {stage:'verdict', trust_score, verdict, corrections, summary, warrant_id,
//                       tribunal_url, latency_ms}
//     {stage:'done', tribunal_url}
//     {stage:'error', error}
//   Nothing else is consumed here, and nothing else is invented.
//
// AUTH, and why this page usually falls back: streamVerify calls
// `resolveApiKey(svc, req)` WITHOUT the `{ base44 }` option, so the signed-in-user
// branch of that helper never runs. No `x-api-key` header ⇒ 401 "Missing x-api-key
// header". A visitor off the street does not have a key, so the default path here is
// POST verifyResponse — which does have a public branch (5 free runs/day per IP) —
// and the page says which transport it used, every time, in the UI and on the verdict.
//
// The stream is not attempted keyless: a request we know will 401 buys nothing but a
// slower "sorry". Paste a key and the live path lights up.
//
// TIMING HONESTY: streamVerify makes ONE model call and then emits every claim event
// in a tight loop, so claims arrive as a burst milliseconds apart, not as a slow
// deliberation. This page renders them as they land and never fakes a cadence, never
// shows a per-claim clock, and never draws a placeholder row for a claim that has not
// arrived.

const DOMAIN = 'General';
const SOURCE = 'live-tribunal';

const EXAMPLE = `The Eiffel Tower was completed in 1889 for the World's Fair and stands 330 metres tall. It was designed by Gustave Eiffel, who also designed the internal frame of the Statue of Liberty. It held the record as the world's tallest structure until the Empire State Building opened in 1931, and it is repainted every seven years using roughly 60 tonnes of paint.`;

// The backend verdict enum is verified | contested | rejected.
// NOTE: STATE_ALIASES in tokens.js maps `verified` and `contested`, but NOT
// `rejected` — normalizeState('rejected') resolves to `unknown`, which reads as
// "nobody checked this" when in fact the tribunal checked and said no. That would be
// a quiet lie in the safe-looking direction, so the mapping is explicit here.
function verdictState(v) {
  const k = String(v || '').trim().toLowerCase();
  if (k === 'verified') return 'supported';
  if (k === 'contested') return 'contested';
  if (k === 'rejected') return 'unsupported';
  return normalizeState(v);
}

// A claim event carries a BOOLEAN `supported`, not a spectrum.
// true  → `supported`   (the tribunal says the evidence carries it)
// false → `unsupported` (EPISTEMIC.unsupported: "the evidence does not carry this
//                        claim, or contradicts it" — exactly what a false flag means)
// Never `contested`: contested means credible sources DISAGREE, and this transport
// never reports two sources at all. Amber here would invent a second opinion.
function claimState(supported) {
  return supported ? 'supported' : 'unsupported';
}

// Red-team: only verifyResponse runs one (`runRedTeamAttack`); streamVerify has no
// red-team pass whatsoever, so on the stream transport this is "not run", not "clean".
// `certified` maps to `qualified`, never `supported` — an attack that failed to break
// an answer is not evidence the answer is true, it is a conditional pass, which is
// precisely what EPISTEMIC.qualified means.
function redTeamView(transport, rt) {
  if (transport === 'stream') {
    return {
      state: 'unknown',
      label: 'Not run on this transport',
      note: 'streamVerify has no red-team pass — it is a single-pass tribunal only. The adversarial stress test lives in verifyResponse. Absent, not clean.',
    };
  }
  if (!rt || !rt.run_id) {
    return {
      state: 'unknown',
      label: 'No run returned',
      note: 'The response carried no red-team run id, so no adversarial attempt is on record for this verdict.',
    };
  }
  if (rt.outcome === 'broken') {
    return {
      state: 'unsupported',
      label: 'Broken by the attack',
      note: `The adversarial pass broke this answer${rt.severity ? ` (severity: ${rt.severity})` : ''}. The verdict above stands as issued, but it did not survive contact with an attacker.`,
    };
  }
  if (rt.outcome === 'error') {
    return {
      state: 'unknown',
      label: 'Attack errored',
      note: 'The red-team pass failed to complete, so this answer is uncertified — untested, rather than tested and passed.',
    };
  }
  return {
    state: 'qualified',
    label: 'Held under attack',
    note: `The adversarial pass ran and did not break the answer${rt.outcome ? ` (outcome: ${rt.outcome})` : ''}. That is a conditional pass — surviving one attack is not proof of truth, only of resilience against what was tried.`,
  };
}

const EMPTY_RUN = {
  transport: null,        // 'stream' | 'single'
  started: false,
  running: false,
  seen: {},               // observed stage → true
  claims: [],
  expected: null,
  verdict: null,
  error: null,
  ended: null,            // 'verdict' | 'done' | 'error' | 'dropped' | 'aborted' | 'failed'
  unknownStages: [],
};

/**
 * POST to streamVerify and return the raw Response so the body can be streamed.
 * Two candidate routes are tried in order: the same-origin `/functions/<name>` path
 * this repo's own SDK page documents, then the SDK's raw fetch helper (which resolves
 * the API base and attaches session auth headers). A 404 means "wrong route here",
 * so we move on; anything else — including 401 — is a real answer and is returned.
 */
async function openStream({ text, apiKey, signal }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const body = JSON.stringify({ text, domain: DOMAIN, source: SOURCE });

  const attempts = [
    () => fetch('/functions/streamVerify', { method: 'POST', headers, body, signal, credentials: 'same-origin' }),
  ];
  if (typeof base44?.functions?.fetch === 'function') {
    attempts.push(() => base44.functions.fetch('/streamVerify', { method: 'POST', headers, body, signal }));
  }

  let last = null;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (res && res.status !== 404) return res;
      last = res;
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      last = last || null;
    }
  }
  if (last) return last;
  throw new Error('streamVerify could not be reached on any known route.');
}

export default function LiveTribunal() {
  const reduced = useReducedMotion();

  const [text, setText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKeyField, setShowKeyField] = useState(false);
  const [run, setRun] = useState(EMPTY_RUN);
  const [fallbackReason, setFallbackReason] = useState(null);
  const [mode, setMode] = useState(null);       // driftAlert { mode, since, reason }
  const [modeError, setModeError] = useState(false);

  const abortRef = useRef(null);
  const canStream = apiKey.trim().length > 0;

  // ——— operating mode, read before anything is claimed about the tribunal
  useEffect(() => {
    let cancelled = false;
    base44.functions.invoke('driftAlert', { op: 'mode' })
      .then((r) => { if (!cancelled) setMode(r?.data || r || null); })
      .catch(() => { if (!cancelled) setModeError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* nothing to cancel */ } }, []);

  const patch = useCallback((fn) => setRun((prev) => ({ ...prev, ...fn(prev) })), []);

  // ——— one SSE frame → one state change. Unknown stages are collected, not guessed at.
  const handleEvent = useCallback((evt) => {
    const stage = evt?.stage;
    if (!stage) return;
    patch((prev) => {
      const seen = { ...prev.seen, [stage]: true };
      switch (stage) {
        case 'analyzing':
          return { seen };
        case 'claims':
          return { seen, expected: Number.isFinite(Number(evt.count)) ? Number(evt.count) : null };
        case 'claim': {
          const c = evt.claim || {};
          const claimText = typeof c.claim === 'string' ? c.claim : String(c.claim ?? '');
          if (!claimText) return { seen };
          return {
            seen,
            claims: [...prev.claims, {
              claim: claimText,
              supported: !!c.supported,
              notes: typeof c.notes === 'string' ? c.notes : '',
              state: claimState(!!c.supported),
            }],
          };
        }
        case 'verdict':
          return {
            seen,
            ended: 'verdict',
            verdict: {
              transport: 'stream',
              verdict: evt.verdict,
              verdictState: verdictState(evt.verdict),
              trust_score: evt.trust_score,
              corrections: Array.isArray(evt.corrections) ? evt.corrections : [],
              summary: evt.summary || '',
              warrant_id: evt.warrant_id || null,
              tribunal_url: evt.tribunal_url || null,
              latency_ms: evt.latency_ms,
              cached: false,
              ...redTeamPayload('stream', null),
            },
          };
        case 'done':
          return { seen, ended: 'done' };
        case 'error':
          return { seen, ended: 'error', error: evt.error || 'The tribunal reported an error without saying what it was.' };
        default:
          return { seen, unknownStages: [...prev.unknownStages, stage] };
      }
    });
  }, [patch]);

  const runStream = useCallback(async (value, signal) => {
    const res = await openStream({ text: value, apiKey: apiKey.trim(), signal });
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch { /* non-JSON error body */ }
      const err = new Error(payload?.error || `streamVerify answered ${res.status}.`);
      err.status = res.status;
      throw err;
    }
    if (!res.body || typeof res.body.getReader !== 'function') {
      const err = new Error('This browser gave no readable stream body, so the live feed cannot be read here.');
      err.status = 0;
      throw err;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      buf += dec.decode(chunk, { stream: true });
      const frames = buf.split('\n\n');
      buf = frames.pop() || '';
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith('data:')) continue;
        try { handleEvent(JSON.parse(line.slice(5).trim())); } catch { /* a torn frame is not an event */ }
      }
    }
  }, [apiKey, handleEvent]);

  const runSingle = useCallback(async (value) => {
    const res = await base44.functions.invoke('verifyResponse', { text: value, domain: DOMAIN, source: SOURCE });
    const d = res?.data || res;
    if (!d || d.error) throw new Error(d?.error || 'verifyResponse returned nothing.');

    const claims = Array.isArray(d.claims) ? d.claims : [];
    patch(() => ({
      expected: claims.length,
      claims: claims.map((c) => ({
        claim: typeof c?.claim === 'string' ? c.claim : String(c?.claim ?? ''),
        supported: !!c?.supported,
        notes: typeof c?.notes === 'string' ? c.notes : '',
        state: claimState(!!c?.supported),
      })).filter((c) => c.claim),
      seen: { request: true, response: true, verdict: true },
      ended: 'verdict',
      verdict: {
        transport: 'single',
        verdict: d.verdict,
        verdictState: verdictState(d.verdict),
        trust_score: d.trust_score,
        corrections: Array.isArray(d.corrections) ? d.corrections : [],
        summary: '',                      // verifyResponse does not return a summary field
        warrant_id: d.warrant_id || null,
        tribunal_url: d.tribunal_url || null,
        latency_ms: d.latency_ms,
        tribunal_version: d.tribunal_version || null,
        service_mode: d.service_mode || null,
        mode_read_error: !!d.mode_read_error,
        cached: !!d.cached,
        cache_age_seconds: d.cache_age_seconds,
        red_team: d.red_team || null,
        ...redTeamPayload('single', d.red_team),
      },
    }));
  }, [patch]);

  const start = useCallback(async (raw) => {
    const value = String(raw ?? text).trim();
    if (!value) return;

    try { abortRef.current?.abort(); } catch { /* nothing in flight */ }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setFallbackReason(null);
    setRun({ ...EMPTY_RUN, started: true, running: true, transport: canStream ? 'stream' : 'single' });

    if (canStream) {
      try {
        await runStream(value, ctrl.signal);
        setRun((prev) => ({
          ...prev,
          running: false,
          // The reader finished. If no verdict ever arrived, the stream dropped —
          // say so rather than leaving a spinner implying work that stopped.
          ended: prev.ended || 'dropped',
        }));
        return;
      } catch (e) {
        if (e?.name === 'AbortError') { setRun((prev) => ({ ...prev, running: false, ended: 'aborted' })); return; }
        setFallbackReason(
          e?.status === 401 || e?.status === 403
            ? `The live stream refused that key (${e.status}: ${e.message}). Falling back to a single-shot verifyResponse call, which has a public path.`
            : `The live stream failed (${e?.message || 'no reason given'}). Falling back to a single-shot verifyResponse call.`,
        );
        setRun((prev) => ({ ...EMPTY_RUN, started: true, running: true, transport: 'single', unknownStages: prev.unknownStages }));
      }
    }

    try {
      await runSingle(value);
      setRun((prev) => ({ ...prev, running: false }));
    } catch (e) {
      setRun((prev) => ({
        ...prev,
        running: false,
        ended: 'failed',
        error: e?.response?.data?.error || e?.message || 'The verification request failed and gave no reason.',
      }));
    }
  }, [text, canStream, runStream, runSingle]);

  const cancel = useCallback(() => {
    try { abortRef.current?.abort(); } catch { /* already finished */ }
    setRun((prev) => ({ ...prev, running: false, ended: prev.ended || 'aborted' }));
  }, []);

  // ——— the rail. Two shapes, because the two transports genuinely differ.
  const stages = useMemo(() => {
    const { transport, running, seen, claims, expected, ended, verdict } = run;

    if (transport === 'single') {
      return [
        { event: 'POST', label: 'Request sent', status: run.started ? 'done' : 'idle', detail: run.started ? 'verifyResponse, one JSON body' : 'not started' },
        {
          event: '(none)',
          label: 'In flight',
          status: running ? 'working' : run.started ? 'done' : 'idle',
          detail: 'this transport emits no intermediate stages — there is nothing to watch mid-flight',
        },
        {
          event: 'response',
          label: 'Verdict',
          status: verdict ? 'done' : ended === 'failed' ? 'failed' : running ? 'idle' : 'idle',
          detail: verdict ? (verdict.cached ? 'returned from cache' : 'returned') : ended === 'failed' ? 'the request failed' : 'not received',
        },
      ];
    }

    const claimsAnnounced = seen.claims;
    return [
      {
        event: 'analyzing',
        label: 'Analyzing',
        status: !run.started ? 'idle' : seen.analyzing ? (claimsAnnounced || ended ? 'done' : 'working') : running ? 'working' : 'idle',
        detail: seen.analyzing ? 'the tribunal acknowledged the text' : run.started ? 'waiting for the first frame' : 'not started',
      },
      {
        event: 'claims',
        label: 'Claims announced',
        status: claimsAnnounced ? 'done' : running ? 'idle' : run.started ? 'idle' : 'idle',
        detail: expected == null ? 'count not announced yet' : `${expected} claim${expected === 1 ? '' : 's'}`,
      },
      {
        event: 'claim',
        label: 'Claims arriving',
        status: expected != null && claims.length >= expected && expected > 0 ? 'done' : claims.length ? 'working' : 'idle',
        detail: expected == null ? `${claims.length} received` : `${claims.length} of ${expected}`,
      },
      {
        event: 'verdict',
        label: 'Verdict',
        status: verdict ? 'done' : ended === 'error' ? 'failed' : 'idle',
        detail: verdict ? `${verdict.verdict} · trust ${verdict.trust_score}` : ended === 'error' ? 'the stream reported an error' : 'not received',
      },
      {
        event: 'done',
        label: 'Stream closed',
        status: seen.done ? 'done' : ended === 'dropped' ? 'failed' : 'idle',
        detail: seen.done ? 'the server closed cleanly' : ended === 'dropped' ? 'the body ended without a done frame' : 'still open',
      },
    ];
  }, [run]);

  const roles = useMemo(() => {
    const { transport, running, started, verdict, seen } = run;
    const single = transport === 'single';
    const working = running && (single || seen.analyzing || !seen.verdict);
    const trio = !started ? 'idle' : verdict ? 'done' : working ? 'working' : 'idle';
    const rt = redTeamView(transport === 'stream' ? 'stream' : 'single', verdict?.red_team);

    return [
      { key: 'proposer', label: 'Proposer', status: trio, note: 'derived — decomposes the text into claims inside the single pass' },
      { key: 'critic', label: 'Critic', status: trio, note: 'derived — attacks each claim inside the same pass' },
      { key: 'verifier', label: 'Verifier', status: trio, note: 'derived — settles support and scores trust' },
      {
        key: 'red-team',
        label: 'Red team',
        status: transport === 'stream' ? 'na' : !started ? 'idle' : verdict ? (rt.state === 'unsupported' ? 'failed' : verdict.red_team?.run_id ? 'done' : 'na') : running ? 'working' : 'idle',
        note: transport === 'stream'
          ? 'not run — streamVerify has no red-team pass at all'
          : verdict
            ? rt.label
            : running ? 'runs inside the single request; no separate signal' : 'runs after the verdict, on the verifyResponse path only',
      },
    ];
  }, [run]);

  const railCaption = run.transport === 'single'
    ? 'verifyResponse is not a stream — these three nodes describe one request/response, not server events'
    : <>the labels below are the literal <code className="font-mono">stage</code> values streamVerify sends</>;

  const modeToken = mode?.mode && mode.mode !== 'normal' ? stateFor('contested') : null;

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: FOCUS }}>
            <Radio className="h-3.5 w-3.5" /> Live Tribunal
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white sm:text-3xl">
            Watch a verification happen.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: TEXT.secondary }}>
            Paste any AI-written text. The tribunal decomposes it into discrete claims, judges each one, issues
            corrections, and seals the result into an append-only log. Everything below is what the server
            actually sent — the stage names are its own, and where a signal does not exist this page says so
            instead of drawing one.
          </p>

          {/* Operating mode — read from driftAlert before we claim anything about the tribunal. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {modeError ? (
              <span className="text-[11px]" style={{ color: TEXT.muted }}>
                Operating mode unavailable — the mode endpoint did not answer, so this page will not assert one.
              </span>
            ) : !mode ? (
              <span className="text-[11px]" style={{ color: TEXT.muted }}>Reading the tribunal&apos;s operating mode…</span>
            ) : modeToken ? (
              <span
                className="inline-flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-[11.5px]"
                style={{ borderColor: 'rgba(251,191,36,0.30)', background: 'rgba(251,191,36,0.06)', color: TEXT.secondary }}
              >
                <TriangleAlert className="h-3.5 w-3.5" style={{ color: modeToken.hex }} aria-hidden="true" />
                Service mode <code className="font-mono">{mode.mode}</code>
                {mode.since ? <span style={{ color: TEXT.muted }}>since {String(mode.since).slice(0, 19).replace('T', ' ')}</span> : null}
                {mode.reason ? <span style={{ color: TEXT.muted }}>· {mode.reason}</span> : null}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: TEXT.muted }}>
                Operating mode: <code className="font-mono">{mode.mode}</code>
                {mode.since ? ` since ${String(mode.since).slice(0, 10)}` : ''}
              </span>
            )}
          </div>
        </header>

        {/* ————————————————————————————————— input */}
        <Surface className="mb-4">
          <label htmlFor="live-text" className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
            Text to verify
          </label>
          <textarea
            id="live-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Paste an AI answer, a paragraph of a report, a claim someone made online…"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#080B11] p-3 text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {run.running ? (
              <Button variant="outline" onClick={cancel}>
                <Square className="h-3.5 w-3.5" />
                <span className="ml-1.5">Stop</span>
              </Button>
            ) : (
              <Button onClick={() => start()} disabled={!text.trim()}>
                <Play className="h-4 w-4" />
                <span className="ml-1.5">{run.started ? 'Verify again' : 'Convene the tribunal'}</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => setText(EXAMPLE)} disabled={run.running}>
              <Zap className="h-3.5 w-3.5" />
              <span className="ml-1.5">Load example</span>
            </Button>
            {run.started && !run.running ? (
              <Button variant="ghost" onClick={() => { setRun(EMPTY_RUN); setFallbackReason(null); }}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="ml-1.5">Clear</span>
              </Button>
            ) : null}
          </div>

          {/* Transport disclosure — stated BEFORE the run, not after it. */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: TEXT.muted }} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed" style={{ color: TEXT.muted }}>
                {canStream ? (
                  <>
                    <span style={{ color: TEXT.secondary }}>Live stream armed.</span> This run will POST to{' '}
                    <code className="font-mono">streamVerify</code> with your key and render each server-sent frame
                    as it lands. If the key is refused, the page falls back to{' '}
                    <code className="font-mono">verifyResponse</code> and says so.
                  </>
                ) : (
                  <>
                    <span style={{ color: TEXT.secondary }}>No API key — the live stream is unavailable.</span>{' '}
                    <code className="font-mono">streamVerify</code> requires an{' '}
                    <code className="font-mono">x-api-key</code> header and returns 401 without one, so this run will
                    use <code className="font-mono">verifyResponse</code> instead: one request, one response, no
                    intermediate stages to watch. Same tribunal, same warrant — you just do not get to see it think.
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowKeyField((v) => !v)}
              className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
              style={{ color: FOCUS }}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showKeyField ? 'Hide the API key field' : 'I have an API key — unlock the live stream'}
            </button>

            {showKeyField ? (
              <div className="mt-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk_sf2x_…"
                  aria-label="Aether API key"
                  className="w-full rounded-lg border border-white/10 bg-[#080B11] p-2.5 font-mono text-[12px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
                />
                <p className="mt-1.5 text-[11px]" style={{ color: TEXT.muted }}>
                  Held in this tab&apos;s memory only — never written to storage, never put in the URL, gone when you
                  close the tab. It is sent as the <code className="font-mono">x-api-key</code> header on the stream
                  request and nowhere else. Keys are issued from your Aether account; without one this page still
                  works, it just cannot show you the tribunal mid-thought.
                </p>
              </div>
            ) : null}
          </div>
        </Surface>

        {fallbackReason ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5"
            style={{ borderColor: 'rgba(201,176,138,0.30)', background: 'rgba(201,176,138,0.06)' }}
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: stateFor('stale').hex }} aria-hidden="true" />
            <span className="text-[12px] leading-relaxed" style={{ color: TEXT.secondary }}>{fallbackReason}</span>
          </div>
        ) : null}

        {/* ————————————————————————————————— the pipeline */}
        {run.started ? (
          <PipelineRail
            className="mb-4"
            stages={stages}
            roles={roles}
            reduced={reduced}
            caption={railCaption}
            footnote={
              run.transport === 'stream'
                ? 'Claim frames also arrive as a burst: the server emits them in one loop the moment the model returns, so what you see is delivery order, not deliberation time.'
                : 'On this transport there is nothing at all to derive from — the roles below reflect one request being in flight, no more.'
            }
          />
        ) : null}

        {/* ————————————————————————————————— claims */}
        <ClaimStream
          className="mb-4"
          claims={run.claims}
          expected={run.expected}
          running={run.running}
          started={run.started}
          reduced={reduced}
          onStart={() => { setText(EXAMPLE); }}
        />

        {/* ————————————————————————————————— failure states, stated plainly */}
        {run.error ? (
          <HonestEmpty
            className="mb-4"
            title="The tribunal reported an error"
            reason={run.error}
            state="unsupported"
            icon={TriangleAlert}
            action={{ label: 'Try again', onClick: () => start() }}
          />
        ) : null}

        {run.ended === 'dropped' ? (
          <HonestEmpty
            className="mb-4"
            title="The stream ended without a verdict"
            reason="The connection closed after the last frame you can see above, and no verdict frame ever arrived. Nothing is still running — there is no hidden work behind a spinner. Whatever partial claims are shown are all that was received."
            state="unknown"
            icon={Radio}
            action={{ label: 'Run it again', onClick: () => start() }}
          />
        ) : null}

        {run.ended === 'aborted' ? (
          <HonestEmpty
            className="mb-4"
            title="You stopped this run"
            reason="The request was aborted from this tab. The server may still have finished and sealed a warrant on its side — this page cannot see that, so it will not tell you either way."
            state="unknown"
            icon={Square}
            action={{ label: 'Start over', onClick: () => start() }}
          />
        ) : null}

        {run.ended === 'failed' && !run.error ? (
          <HonestEmpty
            className="mb-4"
            title="The verification request failed"
            reason="No verdict came back and no reason was given."
            state="unknown"
            icon={TriangleAlert}
            action={{ label: 'Try again', onClick: () => start() }}
          />
        ) : null}

        {run.unknownStages.length ? (
          <div className="mb-4 rounded-xl border border-white/10 px-3.5 py-2.5 text-[11.5px]" style={{ color: TEXT.muted }}>
            The stream sent {run.unknownStages.length} frame{run.unknownStages.length === 1 ? '' : 's'} this page does
            not know how to render (<code className="font-mono">{[...new Set(run.unknownStages)].join(', ')}</code>).
            They are reported rather than dropped — a UI quietly swallowing an unrecognised event is how a backend
            change becomes invisible.
          </div>
        ) : null}

        {/* ————————————————————————————————— verdict + handoff */}
        {run.verdict ? <VerdictSeal className="mb-4" result={run.verdict} reduced={reduced} /> : null}

        {/* ————————————————————————————————— the standing invitation */}
        {!run.verdict ? (
          <Surface className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white">Already have a warrant id?</div>
                <p className="mt-1 text-[11.5px]" style={{ color: TEXT.muted }}>
                  Skip the run and go straight to the maths — the Proof Theater checks any warrant in your browser.
                </p>
              </div>
              <Link
                to="/proof"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: TEXT.secondary }}
              >
                Open the Proof Theater <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Surface>
        ) : null}

        <StateLegend title="What every badge on this page means" />

        <p className="mt-5 text-[11px] leading-relaxed" style={{ color: TEXT.muted }}>
          Reduced motion: every entrance transition on this page collapses to an instant state change and no
          information is lost — the stage statuses, the claim rows and the verdict are all text and icons first.
        </p>
      </main>
    </div>
  );
}

// Shared shape for the red-team block, so the stream path and the single-shot path
// cannot drift apart on how they describe an absent adversarial pass.
function redTeamPayload(transport, rt) {
  const v = redTeamView(transport, rt);
  return { redTeamState: v.state, redTeamLabel: v.label, redTeamNote: v.note };
}
