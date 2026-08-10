import React, { useMemo, useState } from 'react';
import { Puzzle, Copy, Check, ShieldCheck, MousePointerClick, Store, Chrome, MessageSquare, Download } from 'lucide-react';
import { buildZip } from '@/lib/buildZip';
import AppShell from '@/components/sf2x/AppShell';
import AgentGreeter from '@/components/sf2x/AgentGreeter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

// Public page for the Aether browser extension — a Chrome MV3 extension that
// injects a "Verify with Aether" button next to every AI response on ChatGPT,
// Claude, Gemini, and Copilot. Files are shown as copy-paste blocks (load
// unpacked). Chrome Web Store link is a placeholder pending publication.

function CodeBlock({ name, code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
  };
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-slate-200 font-mono text-xs">{name}</Label>
        <Button onClick={copy} variant="ghost" size="sm" className="h-7 text-xs">
          {copied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </Button>
      </div>
      <pre className="text-[11px] font-mono text-slate-300 bg-black/50 border border-white/5 rounded-lg p-3 overflow-x-auto max-h-80 overflow-y-auto">{code}</pre>
    </div>
  );
}

export default function Extension() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.base44.app';
  const ICON_URL = 'https://media.base44.com/images/public/6a6babb38b48187e5d4799c4/9327bc316_generated_image.png';
  const [apiKey, setApiKey] = useState('');

  const manifest = useMemo(() => JSON.stringify({
    manifest_version: 3,
    name: 'Aether — The Truth Layer for AI',
    version: '0.2.0',
    description: "Verify any AI response. Click 'Verify with Aether' next to any chat message and get a trust score.",
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://chat.openai.com/*', 'https://chatgpt.com/*',
      'https://claude.ai/*', 'https://gemini.google.com/*', 'https://copilot.microsoft.com/*',
      `${origin}/*`,
    ],
    background: { service_worker: 'background.js' },
    content_scripts: [{
      matches: [
        'https://chat.openai.com/*', 'https://chatgpt.com/*',
        'https://claude.ai/*', 'https://gemini.google.com/*', 'https://copilot.microsoft.com/*',
      ],
      js: ['content.js'],
      run_at: 'document_idle',
    }],
    icons: { '16': 'icon.png', '48': 'icon.png', '128': 'icon.png' },
    action: { default_popup: 'popup.html', default_title: 'Aether — set API key', default_icon: { '16': 'icon.png', '48': 'icon.png', '128': 'icon.png' } },
  }, null, 2), [origin]);

  const background = useMemo(() => `// background.js — service worker
const ORIGIN = ${JSON.stringify(origin)};
const ENDPOINT = ORIGIN + '/functions/verifyResponse';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'aether-verify') return;
  (async () => {
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    if (!apiKey) { sendResponse({ error: 'Set your Aether API key in the extension popup.' }); return; }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ text: msg.text, source: 'extension' }),
      });
      const data = await res.json();
      if (!res.ok) { sendResponse({ error: data.error || 'verification failed' }); return; }
      // store verification history (shown in the popup)
      const { history = [] } = await chrome.storage.local.get('history');
      history.unshift({ trust: data.trust_score, verdict: data.verdict, snippet: (msg.text || '').slice(0, 120), url: ORIGIN + (data.tribunal_url || ''), at: Date.now() });
      await chrome.storage.local.set({ history: history.slice(0, 50) });
      sendResponse({ data, origin: ORIGIN });
    } catch (e) { sendResponse({ error: String((e && e.message) || e) }); }
  })();
  return true; // keep the message channel open for the async response
});`, [origin]);

  const content = `// content.js — injected on ChatGPT, Claude, Gemini, Copilot
const PROCESSED = 'data-aether-processed';
const SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-testid*="conversation-turn"]:not([data-testid*="user"])',
  '[data-testid*="assistant"]',
  '[data-message]',
  '.markdown.prose', '.prose', '.message-content',
  '[class*="agent-message"]', 'article',
];

function extractText(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('button, .aether-verify-btn, .aether-card, svg').forEach(n => n.remove());
  return (c.innerText || c.textContent || '').trim();
}
function toneColor(t) { return t >= 75 ? '#34d399' : t >= 50 ? '#fbbf24' : '#fb7185'; }
function verdictLabel(v) { return v === 'verified' ? 'Verified' : v === 'contested' ? 'Contested' : 'Rejected'; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function findMessages() {
  const out = [];
  SELECTORS.forEach(sel => {
    try { document.querySelectorAll(sel).forEach(el => {
      if (el.hasAttribute(PROCESSED)) return;
      if (el.closest('.aether-card') || el.closest('.aether-verify-btn')) return;
      if (el.parentElement && el.parentElement.closest('[' + PROCESSED + ']')) { el.setAttribute(PROCESSED, ''); return; }
      if (extractText(el).length > 60) { el.setAttribute(PROCESSED, ''); out.push(el); }
    }); } catch (e) {}
  });
  return out;
}

function injectButton(el) {
  const btn = document.createElement('button');
  btn.className = 'aether-verify-btn';
  btn.type = 'button';
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verify with Aether';
  Object.assign(btn.style, {
    display: 'inline-flex', alignItems: 'center', gap: '5px', margin: '8px 0 0 0',
    padding: '4px 10px', fontSize: '12px', fontFamily: 'system-ui, sans-serif', fontWeight: '500',
    color: '#070A0F', background: 'linear-gradient(135deg,#34d399,#0d9488)', border: '0', borderRadius: '7px', cursor: 'pointer',
  });
  btn.addEventListener('click', () => {
    const text = extractText(el);
    if (!text) return;
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(7,10,15,.4);border-top-color:#070A0F;border-radius:50%;animation:aether-spin .7s linear infinite"></span> Tribunal running...';
    chrome.runtime.sendMessage({ type: 'aether-verify', text }, (res) => {
      btn.disabled = false;
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verify with Aether';
      if (!res) return;
      if (res.error) showError(el, res.error);
      else renderCard(el, res.data, res.origin);
    });
  });
  el.appendChild(btn);
}

function renderCard(anchor, data, origin) {
  const existing = anchor.parentElement.querySelector(':scope > .aether-card');
  if (existing) existing.remove();
  const t = data.trust_score || 0, tone = toneColor(t);
  const card = document.createElement('div');
  card.className = 'aether-card';
  card.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<div style="width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#34d399,#0d9488);display:flex;align-items:center;justify-content:center;color:#070A0F;font-weight:700;font-size:10px">A</div>' +
      '<span style="font-weight:600;font-size:12px;color:#fff">Aether verdict</span>' +
      '<span style="font-size:10px;color:' + tone + ';margin-left:auto;font-weight:600">● ' + verdictLabel(data.verdict) + '</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="font-size:26px;font-weight:700;color:' + tone + '">' + t + '<span style="font-size:12px;color:#64748b">/100</span></div>' +
      '<div style="flex:1;height:5px;border-radius:99px;background:#1f2937;overflow:hidden"><div style="height:100%;width:' + Math.max(2,t) + '%;background:' + tone + ';border-radius:99px"></div></div>' +
    '</div>' +
    (data.corrections && data.corrections.length ?
      '<div style="margin-top:9px;border-top:1px solid #1f2937;padding-top:8px"><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#fb7185;margin-bottom:4px">Issues (' + data.corrections.length + ')</div>' +
      data.corrections.slice(0,3).map(c => '<div style="font-size:11px;color:#94a3b8;margin-bottom:3px">• ' + escapeHtml(c) + '</div>').join('') + '</div>' : '') +
    '<a href="' + escapeHtml(origin + (data.tribunal_url || ('/verify/' + (data.lineage_id||'')))) + '" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;font-size:11px;color:#34d399;text-decoration:none">View full tribunal debate →</a>';
  Object.assign(card.style, { fontFamily: 'system-ui, sans-serif', marginTop: '8px', padding: '12px 14px', background: '#0B0F16', color: '#e2e8f0', border: '1px solid #1f2937', borderRadius: '12px', maxWidth: '420px', boxShadow: '0 8px 30px rgba(0,0,0,.4)' });
  anchor.parentElement.insertBefore(card, anchor.nextSibling);
}

function showError(el, msg) {
  const existing = el.parentElement.querySelector(':scope > .aether-card');
  if (existing) existing.remove();
  const n = document.createElement('div');
  n.className = 'aether-card';
  n.textContent = 'Aether: ' + msg;
  Object.assign(n.style, { marginTop: '8px', padding: '10px 12px', background: '#0B0F16', color: '#fb7185', border: '1px solid #1f2937', borderRadius: '10px', fontSize: '12px', fontFamily: 'system-ui, sans-serif', maxWidth: '420px' });
  el.parentElement.insertBefore(n, el.nextSibling);
  setTimeout(() => n.remove(), 5000);
}

function scan() { findMessages().forEach(injectButton); }
const style = document.createElement('style');
style.textContent = '@keyframes aether-spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);
scan();
new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
setInterval(scan, 3000);`;

  const popupHtml = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { width: 300px; font: 13px system-ui; background:#070A0F; color:#e2e8f0; padding: 14px; margin:0 }
  h3 { margin: 0 0 4px; font-size: 15px; display:flex; align-items:center; gap:6px }
  .sub { font-size: 10px; letter-spacing:.14em; text-transform:uppercase; color:#64748b; margin-bottom:12px }
  p { font-size: 11px; color:#94a3b8; margin: 0 0 10px }
  input { width:100%; box-sizing:border-box; padding:7px 9px; background:#0B0F16; border:1px solid #1f2937; border-radius:8px; color:#fff; font-size:12px }
  button { margin-top:9px; width:100%; padding:7px; background:#10b981; border:0; border-radius:8px; color:#070A0F; font-weight:600; cursor:pointer }
  #m { font-size: 11px; color:#34d399; margin-top: 6px }
  .hist { margin-top:14px; border-top:1px solid #1f2937; padding-top:10px; max-height:180px; overflow:auto }
  .hist h4 { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#64748b; margin:0 0 6px }
  .row { padding:7px 0; border-bottom:1px solid #1f2937; font-size:11px }
  .row a { color:#34d399; text-decoration:none }
  .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px }
</style></head><body>
  <h3>🛡️ Aether</h3>
  <div class="sub">The Truth Layer for AI</div>
  <p>Paste your Aether API key (sk_…). Stored locally in this browser only.</p>
  <input id="k" placeholder="sk_sf2x_…" />
  <button id="s">Save key</button>
  <div id="m"></div>
  <div class="hist" id="h"><h4>Recent verifications</h4></div>
  <script src="popup.js"></script>
</body></html>`;

  const popupJs = `// popup.js
function tone(t){ return t>=75?'#34d399':t>=50?'#fbbf24':'#fb7185'; }
function verdict(v){ return v==='verified'?'Verified':v==='contested'?'Contested':'Rejected'; }

document.getElementById('s').onclick = async () => {
  const k = document.getElementById('k').value.trim();
  await chrome.storage.sync.set({ apiKey: k });
  document.getElementById('m').textContent = 'Saved.';
};

(async () => {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (apiKey) document.getElementById('k').value = apiKey;
  const { history = [] } = await chrome.storage.local.get('history');
  const h = document.getElementById('h');
  if (!history.length) { h.innerHTML += '<div style="font-size:11px;color:#475569">No verifications yet.</div>'; return; }
  history.slice(0, 12).forEach(r => {
    const c = tone(r.trust);
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = '<span class="dot" style="background:' + c + '"></span><b style="color:' + c + '">' + r.trust + '</b> ' + verdict(r.verdict) + ' <a href="' + r.url + '" target="_blank">view →</a><div style="color:#64748b;font-size:10px;margin-top:2px">' + (r.snippet||'').slice(0,70) + '</div>';
    h.appendChild(div);
  });
})();`;

  const steps = [
    'Download aether-extension.zip (button below) and unzip it into a folder — or create the files manually from the blocks further down.',
    'If you unzipped: skip to step 3. If manual: create manifest.json, background.js, content.js, popup.html, popup.js in a folder named aether-extension.',
    'Open chrome://extensions, enable Developer mode (top-right).',
    'Click "Load unpacked" and select the aether-extension folder.',
    'Click the Aether toolbar icon and paste your Aether API key (get one from the Portal).',
    'Open ChatGPT, Claude, Gemini, or Copilot — a "Verify with Aether" button appears next to each AI response. Click it.',
  ];

  const downloadZip = async () => {
    let iconBytes = null;
    try {
      const r = await fetch(ICON_URL);
      if (r.ok) iconBytes = new Uint8Array(await r.arrayBuffer());
    } catch {}
    const files = [
      { name: 'manifest.json', data: manifest },
      { name: 'background.js', data: background },
      { name: 'content.js', data: content },
      { name: 'popup.html', data: popupHtml },
      { name: 'popup.js', data: popupJs },
    ];
    if (iconBytes) files.push({ name: 'icon.png', data: iconBytes });
    const blob = buildZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aether-extension.zip';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded aether-extension.zip' });
  };

  const downloadIcon = async () => {
    try {
      const r = await fetch(ICON_URL);
      const b = await r.blob();
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = 'aether-icon-128.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast({ title: 'Icon download failed', variant: 'destructive' }); }
  };

  const shortDesc = "Verify any AI response — click 'Verify with Aether' next to a chat message for an instant trust score and hallucination flags.";
  const detailedDesc = `Aether — The Truth Layer for AI.\n\nThe Aether browser extension adds a "Verify with Aether" button next to every AI response on ChatGPT, Claude, Gemini, and Copilot. Click it and Aether's independent tribunal runs a multi-model verification: the response is checked against authoritative sources, decomposed into atomic claims, and scored for trust. A trust score (0–100), verdict, and any factual corrections appear inline beneath the answer — so you can see at a glance whether an AI response is verified, contested, or rejected.\n\nYour API key is stored only in your browser's sync storage; no page content other than the message you choose to verify is sent anywhere.\n\nDon't trust. Verify.`;
  const singlePurpose = "Verify the factual trustworthiness of AI-generated text by sending the response the user selects to the Aether verification service.";
  const permissionJustification = `storage — Stores only the user's Aether API key and a local log of recent verifications (trust score, snippet, link). No browsing history is collected.\nactiveTab + host_permissions (chat.openai.com, chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com) — Reads the visible AI response the user clicks "Verify" on so it can be sent to Aether for verification. No other page content, form inputs, credentials, or personal data is read or transmitted.`;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <Puzzle className="h-3.5 w-3.5" /> Browser Extension
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Aether in your browser</h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
            The Aether extension injects a "Verify with Aether" button next to every AI response on ChatGPT, Claude, Gemini, and Copilot. Click it — the tribunal runs, a trust score appears inline, and hallucinations are flagged in real time.
          </p>
          <div className="mt-2"><AgentGreeter
            agentKey="integration_support"
            to="/integration-support"
            firstGreeting="Hi! I'm your Integration Support assistant. I can help you install and configure the browser extension. Click below if you need help."
            returningGreeting="I'm here if you need help with the extension."
            label="Ask integration support"
          /></div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <Feature icon={MousePointerClick} title="One-click verify" desc="A button appears next to every AI message. Click → trust score." />
          <Feature icon={ShieldCheck} title="Inline verdict" desc="Trust score, verdict, and corrections — rendered below the response." />
          <Feature icon={Chrome} title="Works everywhere" desc="ChatGPT, Claude, Gemini, Copilot — and any chat UI." />
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-emerald-300" />
            <span className="text-sm text-slate-200">Chrome Web Store listing — coming soon.</span>
          </div>
          <a href="https://chrome.google.com/webstore" target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:text-emerald-200">For now: load unpacked below →</a>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-white mb-3"><MessageSquare className="h-4 w-4 text-emerald-400" /> Install in 6 steps</div>
          <ol className="space-y-2 text-sm text-slate-400">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="shrink-0 h-5 w-5 rounded-full bg-emerald-400/15 text-emerald-300 text-[11px] flex items-center justify-center font-semibold mt-0.5">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <div className="text-sm font-medium text-white">Extension files</div>
            <Button onClick={downloadZip} size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-[#070A0F]">
              <Download className="h-4 w-4" /> Download .zip
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 mb-4">Download the ready-to-load .zip, unzip, and "Load unpacked" in chrome://extensions — or paste the files manually below. Endpoint origin auto-filled to <span className="font-mono text-slate-400">{origin}</span>.</p>
          <CodeBlock name="manifest.json" code={manifest} />
          <CodeBlock name="background.js" code={background} />
          <CodeBlock name="content.js" code={content} />
          <CodeBlock name="popup.html" code={popupHtml} />
          <CodeBlock name="popup.js" code={popupJs} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-white mb-1"><Store className="h-4 w-4 text-emerald-400" /> Chrome Web Store listing</div>
          <p className="text-[11px] text-slate-500 mb-4">Paste these into the Developer Dashboard. Privacy policy points at your app's <span className="font-mono text-slate-400">/privacy</span> page.</p>
          <CodeBlock name="Privacy policy URL" code={origin + '/privacy'} />
          <CodeBlock name="Single purpose" code={singlePurpose} />
          <CodeBlock name="Permission justification" code={permissionJustification} />
          <CodeBlock name="Short description (≤132 chars)" code={shortDesc} />
          <CodeBlock name="Detailed description" code={detailedDesc} />
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-2">Submission checklist</div>
            <ul className="space-y-1.5 text-[12px] text-slate-400">
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Upload aether-extension.zip via "Add new item" → "Upload a package".</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Set Category: Productivity.</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Upload the 128×128 store icon (download below) to the Icon field.</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Add 1–5 screenshots (1280×800) — capture ChatGPT with the Verify button + verdict card.</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Paste the Privacy policy URL, Single purpose, and Permission justification above.</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> Submit for review — Chrome will ask you to justify the chat-site host permissions (normal).</li>
            </ul>
            <Button onClick={downloadIcon} variant="outline" size="sm" className="mt-3">
              <Download className="h-4 w-4" /> Download 128×128 icon
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <Label className="text-slate-200 text-sm">Your Aether API key</Label>
          <p className="text-[11px] text-slate-500 mt-1 mb-3">Generate one in the Portal, then paste it into the extension popup. It lives only in your browser's sync storage.</p>
          <div className="flex gap-2">
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value.trim())} placeholder="sk_sf2x_…" className="font-mono text-sm" />
            <Button variant="outline" className="shrink-0" onClick={() => { navigator.clipboard?.writeText?.(apiKey); toast({ title: 'Copied' }); }} disabled={!apiKey}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <Icon className="h-5 w-5 text-emerald-400 mb-2" />
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{desc}</div>
    </div>
  );
}