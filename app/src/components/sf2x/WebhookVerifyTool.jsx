import React, { useState } from 'react';
import { Webhook, Loader2, Send, AlertCircle, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// Webhook setup tool — powered by the `webhookVerify` function.
// Developers enter their webhook URL + test text and see the webhook response.

export default function WebhookVerifyTool() {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('Vitamin C prevents the common cold.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function run() {
    if (!url.trim() || !text.trim() || loading) return;
    if (!/^https?:\/\//.test(url.trim())) { setErr('Enter a valid http(s) webhook URL.'); return; }
    setLoading(true); setErr(null); setResult(null);
    try {
      const res = await base44.functions.invoke('webhookVerify', { text: text.trim(), webhook_url: url.trim() });
      const d = res?.data || res;
      if (d?.error) { setErr(d.error); return; }
      setResult(d);
    } catch (e) { setErr(e?.message || 'Webhook test failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-5 my-6">
      <div className="flex items-center gap-2 mb-3">
        <Webhook className="h-4 w-4 text-emerald-400" />
        <h3 className="font-heading text-base font-semibold text-foreground">Webhook setup</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">Enter your webhook URL and a test text. POST /webhookVerify verifies the text and delivers the result to your endpoint — so you can confirm your receiver works.</p>
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-slate-400">Webhook URL</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/aether-webhook" className="text-sm mt-1 font-mono" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Test text</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-sm mt-1" />
        </div>
        <Button onClick={run} disabled={loading || !url.trim() || !text.trim()} className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 h-11 md:h-9">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send test webhook</>}
        </Button>
      </div>

      {err && <div className="mt-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-400/10 rounded-md px-3 py-2 border border-amber-400/20"><AlertCircle className="h-3.5 w-3.5" /> {err}</div>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Webhook test completed</div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Delivered payload</div>
            <pre className="text-[12px] font-mono text-slate-300 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}