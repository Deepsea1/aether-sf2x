import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles, Swords, Gavel, ShieldAlert, Loader2, ArrowRight, Share2, Check, Copy, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TierBadge from '@/components/sf2x/TierBadge';
import PublicNav from '@/components/sf2x/PublicNav';

const GUEST_DAILY = 3;
const GUEST_KEY = 'aether_playground_guest';
function guestRunsLeft() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    if (raw.date !== today) return GUEST_DAILY;
    return Math.max(0, GUEST_DAILY - (raw.count || 0));
  } catch { return GUEST_DAILY; }
}
function bumpGuestRun() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    const count = raw.date === today ? (raw.count || 0) : 0;
    localStorage.setItem(GUEST_KEY, JSON.stringify({ date: today, count: count + 1 }));
  } catch { /* ignore */ }
}

const DOMAINS = ['General', 'Medicine', 'Legal', 'HR', 'Engineering'];

function Nav() {
  return <PublicNav />;
}

function verdictColor(v) {
  if (v === 'agreed') return 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30';
  if (v === 'contested') return 'text-amber-300 bg-amber-400/10 ring-amber-400/30';
  return 'text-rose-300 bg-rose-400/10 ring-rose-400/30';
}

// Panel status: idle | active | done
function PanelStatus({ status }) {
  if (status === 'active') return <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />;
  if (status === 'done') return <Check className="h-3.5 w-3.5 text-emerald-300" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />;
}

function Shimmer() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-2.5 w-full rounded bg-white/[0.06]" />
      <div className="h-2.5 w-5/6 rounded bg-white/[0.05]" />
      <div className="h-2.5 w-4/6 rounded bg-white/[0.04]" />
    </div>
  );
}

export default function Playground() {
  const [prompt, setPrompt] = useState('');
  const [domain, setDomain] = useState('General');
  const [stakes, setStakes] = useState('medium'); // medium = fast 2-model; high = full 3-way
  const [loading, setLoading] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [guestLeft, setGuestLeft] = useState(GUEST_DAILY);
  const timerRef = useRef(null);

  // Phase sequence: proposing → (critiquing, full only) → verifying → red-teaming
  const phases = stakes === 'high'
    ? ['proposing', 'critiquing', 'verifying', 'red-teaming']
    : ['proposing', 'verifying', 'red-teaming'];

  useEffect(() => { document.title = 'Aether Tribunal Playground — Watch AI debate a verdict'; }, []);
  useEffect(() => {
    base44.auth.isAuthenticated().then((a) => { setAuthed(a); if (!a) setGuestLeft(guestRunsLeft()); }).catch(() => setAuthed(false));
  }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function run() {
    if (!prompt.trim() || loading) return;
    setError(null);
    setResult(null);
    if (authed === false && guestLeft <= 0) {
      setError('Free limit reached — 3 tribunal runs per day. Sign in for unlimited runs, or use the quick verify on the home page.');
      return;
    }
    setLoading(true);
    setPhaseIdx(0);
    const intervalMs = stakes === 'high' ? 14000 : 6500;
    timerRef.current = setInterval(() => {
      setPhaseIdx((i) => (i < phases.length - 1 ? i + 1 : i));
    }, intervalMs);
    try {
      const res = await base44.functions.invoke('inquireTribunal', { prompt: prompt.trim(), domain, stakes });
      const d = res?.data || res;
      if (d?.error) setError(d.error);
      else {
        setResult(d);
        if (authed === false) { bumpGuestRun(); setGuestLeft((g) => Math.max(0, g - 1)); }
      }
    } catch (e) {
      setError(e?.message || 'Tribunal failed to run.');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhaseIdx(phases.length);
      setLoading(false);
    }
  }

  function share() {
    const url = result?.verification_url ? `${window.location.origin}${result.verification_url}` : window.location.href;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  // Map phase index to per-panel status.
  const phaseName = (i) => phases[i];
  const proposerStatus = loading ? (phaseIdx >= 0 ? 'done' : 'idle') : (result ? 'done' : 'idle');
  const proposerActive = loading && phaseIdx === 0;
  const criticStatus = (loading && phases[phaseIdx] === 'critiquing') ? 'active' : (loading && phaseIdx > phases.indexOf('critiquing') ? 'done' : (result ? 'done' : (stakes === 'high' ? 'idle' : 'idle')));
  const criticActive = loading && phases[phaseIdx] === 'critiquing';
  const verifierStatus = (loading && (phases[phaseIdx] === 'verifying' || phases[phaseIdx] === 'red-teaming')) ? 'active' : (result ? 'done' : 'idle');
  const verifierActive = loading && (phases[phaseIdx] === 'verifying' || phases[phaseIdx] === 'red-teaming');

  // Pull real outputs from the result.
  const candidates = result?.candidates || [];
  const corrections = candidates.filter((c) => c.verifier_notes && !c.is_winner);
  const trust = result?.trustworthy_rate ?? result?.version?.trust_score ?? null;
  const consensus = result?.tribunal?.consensus ?? null;
  const certified = result?.certified;

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200 pb-16">
      <Nav />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-6">
        
      </div>
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-2 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/80">Tribunal Playground</span>
            <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-white tracking-tight mt-1">Watch AIs debate your question.</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">Submit a question and watch the proposer–critic–verifier tribunal render a verdict in real time.</p>
          </div>
          <TierBadge tier={stakes === 'high' ? 'enterprise' : 'pro'} size="lg" />
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder=""
            rows={3}
            className="w-full rounded-lg bg-[#070A0F] border border-white/10 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30 resize-none"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-lg bg-[#070A0F] border border-white/10 px-3 h-10 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400/30">
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex items-center rounded-lg border border-white/10 bg-[#070A0F] p-0.5">
              <button onClick={() => setStakes('medium')} className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium transition-colors ${stakes === 'medium' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}><Zap className="h-3.5 w-3.5" /> Fast</button>
              <button onClick={() => setStakes('high')} className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium transition-colors ${stakes === 'high' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}><Swords className="h-3.5 w-3.5" /> Full</button>
            </div>
            <button onClick={run} disabled={!prompt.trim() || loading} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-4 h-10 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Tribunal running…' : 'Run tribunal'}
            </button>
            {authed === false && (
              <span className="text-[11px] text-slate-500 ml-1">{guestLeft} free {guestLeft === 1 ? 'run' : 'runs'} left today · <Link to="/login" className="text-amber-300 hover:text-amber-200">Sign in for unlimited</Link></span>
            )}
          </div>
          {loading && <p className="text-[11px] text-slate-500">{stakes === 'high' ? 'A full 3-way tribunal runs ~10 model calls and can take 1–2 minutes.' : 'The fast 2-model tribunal runs ~5 calls (~20–40s).'} Keep this tab open.</p>}
        </div>

        {/* === Streaming 3-panel tribunal view === */}
        {(loading || result) && (
          <div className="grid md:grid-cols-3 gap-4">
            {/* Proposer */}
            <Panel
              icon={Sparkles} accent="emerald" title="Proposer"
              subtitle={stakes === 'high' ? '3 models answer independently' : '2 models answer independently'}
              status={proposerActive ? 'active' : proposerStatus}
            >
              {proposerActive && !result && (
                <div className="space-y-3">
                  <Shimmer /><Shimmer />
                  <div className="text-[11px] text-slate-500 italic">Independent answers generating…</div>
                </div>
              )}
              {result && candidates.length > 0 && (
                <div className="space-y-2.5">
                  {candidates.slice(0, 3).map((c) => (
                    <div key={c.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${c.is_winner ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className="text-[11px] text-slate-300 truncate flex-1">{c.label}</span>
                        <span className="text-[10px] text-slate-500">{Math.round(c.trust || 0)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-3">{c.answer}</div>
                    </div>
                  ))}
                </div>
              )}
              {!proposerActive && !result && !proposerActive && <div className="text-[11px] text-slate-600">Waiting…</div>}
            </Panel>

            {/* Critic */}
            <Panel
              icon={Swords} accent="amber" title="Critic"
              subtitle={stakes === 'high' ? 'Cross-examination by rival labs' : 'Skipped in fast mode'}
              status={criticActive ? 'active' : criticStatus}
              dim={stakes !== 'high'}
            >
              {stakes !== 'high' && (
                <div className="text-[11px] text-slate-600 italic">The critic round runs in the Full tribunal. Switch to Full to see cross-examination.</div>
              )}
              {stakes === 'high' && criticActive && !result && (
                <div className="space-y-3">
                  <Shimmer /><Shimmer />
                  <div className="text-[11px] text-slate-500 italic">Rival labs challenging the answers…</div>
                </div>
              )}
              {result && corrections.length > 0 && (
                <div className="space-y-1.5">
                  {corrections.slice(0, 4).map((c, i) => (
                    <div key={i} className="text-[11px] text-slate-400 flex gap-1.5"><span className="text-amber-300 shrink-0">•</span><span className="line-clamp-3">{c.verifier_notes}</span></div>
                  ))}
                </div>
              )}
              {result && corrections.length === 0 && stakes === 'high' && (
                <div className="text-[11px] text-emerald-300/80">No objections — answers held up to cross-examination.</div>
              )}
            </Panel>

            {/* Verifier */}
            <Panel
              icon={Gavel} accent="violet" title="Verifier"
              subtitle="Ranking + hardened merge + red-team"
              status={verifierActive ? 'active' : verifierStatus}
            >
              {verifierActive && !result && (
                <div className="space-y-3">
                  <Shimmer />
                  <div className="text-[11px] text-slate-500 italic">Ranking answers + rendering verdict…</div>
                </div>
              )}
              {result && (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-semibold leading-none ${trust != null && trust >= 70 ? 'text-emerald-300' : trust != null && trust >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>{trust != null ? Math.round(trust) : '—'}<span className="text-base text-slate-600">/100</span></span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${verdictColor(consensus)}`}>{consensus || 'verdict'}</span>
                  </div>
                  {certified != null && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${certified ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : 'text-rose-300 bg-rose-400/10 ring-rose-400/30'}`}>{certified ? '✓ Certified' : '✗ Not certified'}</span>
                  )}
                  {result.version?.answer_text && (
                    <div className="text-[11px] text-slate-400 line-clamp-5 leading-relaxed">{result.version.answer_text}</div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* Red-team indicator line */}
        {loading && phases[phaseIdx] === 'red-teaming' && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-3 flex items-center gap-2 text-sm text-rose-200">
            <ShieldAlert className="h-4 w-4 animate-pulse" /> Red-team stress test in progress — attacking the verdict…
          </div>
        )}

        {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">{error}</div>}

        {/* Verdict summary card */}
        {result && (
          <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-[#0B0F16] to-emerald-400/[0.04] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${verdictColor(consensus)}`}>{consensus || 'verdict'}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${certified ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : 'text-rose-300 bg-rose-400/10 ring-rose-400/30'}`}>{certified ? 'Certified' : 'Not certified'}</span>
              </div>
              <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Share2 className="h-3.5 w-3.5" />} {copied ? 'Link copied' : 'Share this verdict'}
              </button>
            </div>
            <div className="flex items-end gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Trust score</div>
                <div className={`text-5xl font-semibold leading-none ${trust != null && trust >= 70 ? 'text-emerald-300' : trust != null && trust >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>{trust != null ? Math.round(trust) : '—'}<span className="text-xl text-slate-600">/100</span></div>
              </div>
              <div className="text-[11px] text-slate-500 pb-1">
                Warrant: <span className="text-slate-300">{result.warrant?.validity_status || '—'}</span><br />
                Confidence: <span className="text-slate-300">{result.warrant?.confidence_score != null ? Math.round(result.warrant.confidence_score * 100) + '%' : '—'}</span>
              </div>
            </div>
            <Link to={result.verification_url || '/verify'} className="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200">View full warrant & lineage <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        )}

        <p className="text-[11px] text-slate-600">The tribunal is a multi-model debate (proposer → critic → verifier) plus an adversarial red-team stress test. A verdict is <span className="text-emerald-400">certified</span> only if it resists the red-team attack. By <Link to="/benchmark" className="underline hover:text-slate-400">benchmark</Link>, the full loop scores 91/100.</p>
      </main>
    </div>
  );
}

function Panel({ icon: Icon, accent, title, subtitle, status, dim, children }) {
  const accents = {
    emerald: { ring: 'border-emerald-400/30', icon: 'text-emerald-300', glow: 'bg-emerald-400/20' },
    amber: { ring: 'border-amber-400/30', icon: 'text-amber-300', glow: 'bg-amber-400/20' },
    violet: { ring: 'border-violet-400/30', icon: 'text-violet-300', glow: 'bg-violet-400/20' },
  };
  const a = accents[accent] || accents.emerald;
  return (
    <div className={`rounded-2xl border bg-[#0B0F16] p-4 transition-all ${dim ? 'opacity-50' : ''} ${status === 'active' ? `${a.ring} ring-1` : 'border-white/10'} ${status === 'done' ? a.ring : ''}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative">
          {status === 'active' && <div className={`absolute inset-0 blur-md rounded-lg ${a.glow}`} />}
          <div className={`relative h-8 w-8 rounded-lg bg-white/[0.03] flex items-center justify-center ${status === 'active' ? a.icon : 'text-slate-500'}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white">{title}</span>
            <PanelStatus status={status} />
          </div>
          <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>
        </div>
      </div>
      <div className="min-h-[80px]">{children}</div>
    </div>
  );
}