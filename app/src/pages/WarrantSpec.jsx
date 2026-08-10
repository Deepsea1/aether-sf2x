import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Terminal, Search, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';

const SPEC = {
  version: '1.1',
  fields: [
    { name: 'warrant_id', type: 'string', desc: 'Globally unique warrant identifier.' },
    { name: 'answer_version_id', type: 'string', desc: 'The attested answer this warrant backs (lineage id).' },
    { name: 'premises', type: 'string[]', desc: 'Explicit premises the conclusion depends on. Empty premises invalidate a warrant.' },
    { name: 'conclusion', type: 'string', desc: 'The warranted conclusion being attested.' },
    { name: 'confidence_score', type: 'number (0–1)', desc: 'Independent verifier confidence given the premises.' },
    { name: 'validity_status', type: 'enum', values: ['valid', 'weak', 'invalid', 'expired'], desc: 'valid = well-supported; weak = mixed; invalid = unsupported/fabricated; expired = premises stale.' },
    { name: 'sources', type: 'string[]', desc: 'Cited sources — independently checked during attestation.' },
    { name: 'expiry_date', type: 'ISO-8601 datetime', desc: 'When premises must be revalidated.' },
    { name: 'signed_hash', type: 'string', desc: 'HMAC-SHA256 attestation over (answer|premises|sources). Verifiable by anyone holding the SF2X attestation key.' },
  ],
};

const EXAMPLE = `{
  "warrant_id": "w_8f3...",
  "answer_version_id": "av_2c1...",
  "premises": [
    "Aspirin inhibits platelet aggregation.",
    "Primary-prevention benefit in low-risk adults is small and outweighed by bleeding risk."
  ],
  "conclusion": "A 52-year-old with no cardiovascular history should not routinely take daily low-dose aspirin for primary prevention.",
  "confidence_score": 0.82,
  "validity_status": "valid",
  "sources": ["USPSTF 2022 recommendation", "NEJM meta-analysis 2019"],
  "expiry_date": "2026-09-01T00:00:00.000Z",
  "signed_hash": "sf2x_sig_dG9iZUV4YW1wbGU..."
}`;

const ENDPOINTS = [
  { name: 'warrantApi', key: true, desc: 'Inbound attestation. Submit an answer + optional premises/sources; returns verdict, trust, claims, signed warrant.', body: '{ "answer_text": "...", "premises": [], "sources": [], "domain": "medicine", "stakes": "high", "model_label": "gpt-5" }' },
  { name: 'batchWarrant', key: true, desc: 'Attest up to 25 answers at once. Per-item results returned in order.', body: '{ "answers": [{ "answer_text": "...", "domain": "finance" }, ...] }' },
  { name: 'revalidateWarrant', key: true, desc: 'Re-check a previously attested answer against the live web. Detects drift, logs corrections, downgrades stale warrants.', body: '{ "answer_version_id": "av_2c1..." }' },
  { name: 'trustScorecard', key: false, desc: 'Free, keyless lookup. Returns the trust scorecard for any lineage id — publish it anywhere.', body: '{ "answer_version_id": "av_2c1..." }' },
  { name: 'gateApi', key: true, desc: 'Callable suppression gate. Returns allow / escalate / suppress for a lineage id so low-trust answers never reach users.', body: '{ "answer_version_id": "av_2c1..." }' },
];

function CurlBlock({ name, body, keyRequired }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0F16] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono text-sm text-emerald-300">{name}</span>
        {keyRequired && <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-300/80 bg-amber-400/10 px-2 py-0.5 rounded-full">x-api-key</span>}
      </div>
      <pre className="px-4 py-3 text-[11px] font-mono text-slate-400 overflow-x-auto leading-relaxed">{`curl -X POST $FUNCTION_URL/${name} \\
  -H "Content-Type: application/json"${keyRequired ? ` \\
  -H "x-api-key: $SF2X_API_KEY` : ''} \\
  -d '${body}'`}</pre>
    </div>
  );
}

function TryScorecard() {
  const [qid, setQid] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!qid.trim()) return;
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await base44.functions.invoke('trustScorecard', { answer_version_id: qid.trim() });
      setRes(r.data);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Lookup failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center gap-2 text-sm text-slate-200 mb-3">
        <Search className="h-4 w-4 text-emerald-400" /> Look up any trust scorecard (no key needed)
      </div>
      <div className="flex gap-2">
        <input
          value={qid}
          onChange={(e) => setQid(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="paste a lineage id / answer_version_id"
          className="flex-1 h-9 rounded-lg bg-black/40 border border-white/10 px-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />
        <button onClick={run} disabled={loading} className="h-9 px-4 rounded-lg bg-emerald-500 text-[#070A0F] text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1.5">
          {loading ? '…' : <>Check <ArrowRight className="h-3.5 w-3.5" /></>}
        </button>
      </div>
      {err && <p className="mt-3 text-xs text-rose-300 flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />{err}</p>}
      {res && (
        <div className="mt-4 rounded-xl border border-white/10 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-heading text-2xl font-semibold text-white">{res.trust_score ?? '—'}<span className="text-sm text-slate-600">/100</span></span>
            <span className="text-xs text-slate-400">{res.warrant_status}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
            <span>confidence: {res.warrant_confidence != null ? Math.round(res.warrant_confidence * 100) + '%' : '—'}</span>
            <span>corrections: {res.corrections_count}</span>
            <span>drift: {res.drift_score != null ? Number(res.drift_score).toFixed(2) : '—'}</span>
          </div>
          <Link to={`/scorecard/${res.answer_version_id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200">Full scorecard <ArrowRight className="h-3 w-3" /></Link>
        </div>
      )}
    </div>
  );
}

export default function WarrantSpec() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">

        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-white tracking-tight">The trust layer for AI</h1>
        <p className="mt-3 text-sm text-slate-400 max-w-xl">
          SF2X is the trust app for AI: an open, auditable attestation format and API. Every answer attested is decomposed into atomic claims, independently source-grounded, scored against domain-specific calibration, and signed. Businesses attest, suppress, and re-validate trust over time — so AI output carries a verifiable warrant, not a promise.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/pricing" className="inline-flex items-center gap-2 text-sm bg-emerald-500 text-[#070A0F] font-medium px-4 py-2 rounded-lg hover:bg-emerald-400">
            <KeyRound className="h-4 w-4" /> Get an API key
          </Link>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300 bg-emerald-400/10 px-2.5 py-1.5 rounded-full">
            <ShieldCheck className="h-3 w-3" /> Warrant Format v{SPEC.version}
          </div>
        </div>

        <section className="mt-10">
          <TryScorecard />
        </section>

        <section className="mt-10">
          <h2 className="font-heading text-lg font-semibold text-white">Warrant fields</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Field</th>
                  <th className="text-left font-medium px-4 py-3">Type</th>
                  <th className="text-left font-medium px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {SPEC.fields.map((f) => (
                  <tr key={f.name} className="border-t border-white/5">
                    <td className="px-4 py-3 align-top font-mono text-emerald-300 whitespace-nowrap">{f.name}</td>
                    <td className="px-4 py-3 align-top text-slate-400 whitespace-nowrap">{f.type}</td>
                    <td className="px-4 py-3 align-top text-slate-300">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-heading text-lg font-semibold text-white">Example warrant</h2>
          <pre className="mt-4 rounded-2xl border border-white/10 bg-[#0B0F16] p-5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">{EXAMPLE}</pre>
        </section>

        <section className="mt-10">
          <h2 className="font-heading text-lg font-semibold text-white">API endpoints</h2>
          <p className="mt-1.5 text-xs text-slate-500">Find each function's URL under Dashboard → Code → Functions. Replace <code className="text-slate-400">$FUNCTION_URL</code> with your provisioned endpoint.</p>
          <div className="mt-4 space-y-4">
            {ENDPOINTS.map((ep) => (
              <div key={ep.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-sm text-emerald-300">{ep.name}</span>
                  {ep.key && <span className="text-[10px] uppercase tracking-wider text-amber-300/80 bg-amber-400/10 px-2 py-0.5 rounded-full">key</span>}
                  {!ep.key && <span className="text-[10px] uppercase tracking-wider text-emerald-300/80 bg-emerald-400/10 px-2 py-0.5 rounded-full">free</span>}
                </div>
                <p className="text-xs text-slate-400 mb-2">{ep.desc}</p>
                <CurlBlock name={ep.name} body={ep.body} keyRequired={ep.key} />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-emerald-500/20 bg-emerald-400/5 p-5">
          <h2 className="font-heading text-base font-semibold text-white flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> How it fits together</h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-300 list-decimal list-inside marker:text-slate-600">
            <li>Your model answers → you call <span className="font-mono text-emerald-300">warrantApi</span> (or <span className="font-mono text-emerald-300">batchWarrant</span>) to attest it.</li>
            <li>Before showing the answer to users, call <span className="font-mono text-emerald-300">gateApi</span> — suppress if it returns <span className="font-mono">suppress</span>.</li>
            <li>Publish the scorecard anywhere via <span className="font-mono text-emerald-300">trustScorecard</span> or the <Link to="/scorecard/" className="text-emerald-300 underline underline-offset-2">/scorecard/:id</Link> page.</li>
            <li>Schedule <span className="font-mono text-emerald-300">revalidateWarrant</span> to catch drift as sources rot and facts change.</li>
          </ol>
        </section>

        <footer className="mt-12 pt-6 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-600">
          <span>SF2X · Warrant Format v{SPEC.version} · open standard</span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-slate-300">About</Link>
            <Link to="/contact" className="hover:text-slate-300">Contact</Link>
            <Link to="/pricing" className="hover:text-slate-300">Pricing</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}