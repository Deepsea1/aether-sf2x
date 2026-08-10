import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function statusTone(s) { return s === 'subscribed' ? 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' : 'text-slate-400 bg-white/5 ring-white/10'; }

export default function SubscribersPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setRows(await base44.entities.NewsletterSubscriber.list('-created_date', 500)); }
    catch (e) { /* */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-emerald-400" />
        <h2 className="font-heading text-base font-semibold text-white">Newsletter Subscribers</h2>
      </div>
      <p className="text-[13px] text-slate-500 max-w-2xl">Everyone signed up for the weekly AI Hallucination Report.</p>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div>}
      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-slate-500">No subscribers yet.</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0B0F16]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/10">
                <th className="text-left text-[10px] uppercase tracking-wider text-slate-500 px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Source</th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2.5 text-[13px] text-slate-200">{r.email}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-400">{r.source || '—'}</td>
                  <td className="px-3 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${statusTone(r.status)}`}>{r.status || 'subscribed'}</span></td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-500">{(r.created_date || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}