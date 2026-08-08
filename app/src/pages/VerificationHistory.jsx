import React, { useEffect, useState, useCallback } from 'react';
import { History, Loader2, Filter } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import AgentGreeter from '@/components/sf2x/AgentGreeter';

const VERDICTS = ['all', 'verified', 'contested', 'rejected'];
const SOURCES = ['all', 'api', 'widget', 'extension', 'playground', 'batch'];

function verdictTone(v) { return v === 'verified' ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : v === 'contested' ? 'text-amber-300 bg-amber-400/10 ring-amber-400/30' : 'text-rose-300 bg-rose-400/10 ring-rose-400/30'; }
function trustTone(t) { return t >= 75 ? 'text-emerald-300' : t >= 50 ? 'text-amber-300' : 'text-rose-300'; }

export default function VerificationHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState('all');
  const [source, setSource] = useState('all');

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.VerificationHistory.list('-created_date', 500);
      setRows(list || []);
    } catch (e) { /* */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => (verdict === 'all' || r.verdict === verdict) && (source === 'all' || r.source === source));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><History className="h-3.5 w-3.5" /> Verification History</div>
          <h1 className="font-heading text-xl font-semibold text-white">Every verification, logged.</h1>
          <p className="text-sm text-slate-500 mt-1.5">Your tribunal history with trust scores, verdicts, and sources. Filter to narrow down.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-slate-500" />
          <div className="flex items-center gap-1.5">
            {VERDICTS.map((v) => (
              <button key={v} onClick={() => setVerdict(v)} className={`text-[11px] px-2.5 py-1 rounded-full ring-1 capitalize ${verdict === v ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-400 ring-white/10'}`}>{v}</button>
            ))}
          </div>
          <span className="text-slate-700">·</span>
          <div className="flex items-center gap-1.5">
            {SOURCES.map((s) => (
              <button key={s} onClick={() => setSource(s)} className={`text-[11px] px-2.5 py-1 rounded-full ring-1 capitalize ${source === s ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-400/10' : 'text-slate-400 ring-white/10'}`}>{s}</button>
            ))}
          </div>
          <span className="text-[11px] text-slate-600 ml-auto">{filtered.length} records</span>
          <AgentGreeter
            agentKey="verification_history"
            to="/verification-assistant"
            firstGreeting="Hi! I'm your Verification History assistant. I can walk you through any past verification, explain why a trust score landed where it did, or help you spot patterns across your history. The button below opens our chat — just ask me anything."
            returningGreeting="I'm here if you need help understanding a verification."
            label="Ask verification assistant"
          />
        </div>

        {loading && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center text-sm text-slate-500">No verifications match these filters.</div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0B0F16]">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/10">
                  <th className="text-left text-[10px] uppercase tracking-wider text-slate-500 px-3 py-2.5 font-medium">Trust</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Verdict</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Text preview</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Source</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.01]">
                    <td className={`px-3 py-2.5 font-semibold tabular-nums ${trustTone(r.trust_score)}`}>{Math.round(r.trust_score)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${verdictTone(r.verdict)}`}>{r.verdict}</span></td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-300 max-w-xs truncate" title={r.text_preview}>{r.text_preview || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-400 capitalize">{r.source || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">{(r.created_date || '').slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}