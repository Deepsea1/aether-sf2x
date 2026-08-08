import React, { useState } from 'react';
import { FileCheck, Loader2, Download, ShieldCheck, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';

export default function Evidence() {
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState(null);
  const [err, setErr] = useState(null);
  const [days, setDays] = useState(30);

  async function generate() {
    setLoading(true); setErr(null); setPack(null);
    try {
      const res = await base44.functions.invoke('generateEvidencePack', { days });
      const d = res?.data || res;
      if (d?.error) setErr(d.error); else setPack(d);
    } catch (e) { setErr(e?.message || 'Failed to generate evidence pack.'); }
    finally { setLoading(false); }
  }

  function download() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aether-evidence-pack-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const counts = pack ? {
    verifications: pack.verifications?.length ?? pack.inquiries?.length ?? 0,
    warrants: pack.warrants?.length ?? 0,
    reviews: pack.reviews?.length ?? 0,
    corrections: pack.corrections?.length ?? 0,
  } : null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><FileCheck className="h-3.5 w-3.5" /> Audit Evidence</div>
          <h1 className="font-heading text-xl font-semibold text-white">SOC 2 evidence pack</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">One-click, auditor-ready bundle of every verification, warrant, gate decision, and correction from a time window. Download as JSON and hand it to your auditor or compliance team.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 space-y-3">
          <div className="text-sm font-medium text-white">Generate an evidence pack</div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-400">Window</span>
            <ResponsiveSelect
              value={String(days)}
              onValueChange={(v) => setDays(Number(v))}
              options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]}
              placeholder="Window"
              triggerClassName="rounded-lg bg-[#070A0F] border-white/10 px-3 h-10 text-sm text-slate-100"
            />
          </div>
          <Button onClick={generate} disabled={loading} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />} Generate pack
          </Button>
          {err && <div className="text-sm text-rose-300">{err}</div>}
        </div>

        {pack && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card label="Verifications" value={counts.verifications} />
              <Card label="Warrants" value={counts.warrants} />
              <Card label="Gate reviews" value={counts.reviews} />
              <Card label="Corrections" value={counts.corrections} />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={download} className="h-11 md:h-8 border-white/10 text-slate-300"><Download className="h-3.5 w-3.5 mr-1.5" /> Download JSON</Button>
            </div>
            <div className="text-[11px] text-slate-600">The pack includes every signed warrant (with source hashes + validity), gate decisions, correction events, and verification metadata for the selected window — sufficient for SOC 2 / ISO 27001 audit evidence.</div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="flex items-center gap-2 mb-2"><Lock className="h-4 w-4 text-amber-300" /><span className="text-sm font-medium text-white">SSO / SAML</span></div>
          <p className="text-[13px] text-slate-500">Single sign-on (SAML / SCIM) for enterprise provisioning is on the roadmap. Until then, invite users via the Portal and manage roles. <Link to="/enterprise" className="text-emerald-300 hover:text-emerald-200">Talk to us →</Link></p>
        </div>
      </div>
    </AppShell>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}