(function () {
  'use strict';
  // Aether — The Truth Layer for AI · embeddable verification widget.
  // Configure via window.AetherConfig = { apiKey, origin } or data attributes on the script tag:
  //   <script src="https://YOUR-APP/functions/widget.js" data-key="sk_..." data-origin="https://YOUR-APP"></script>
  var cfg = window.AetherConfig || {};
  var scriptTag = document.currentScript;
  var origin = cfg.origin || (scriptTag && scriptTag.getAttribute('data-origin')) || '';
  var apiKey = cfg.apiKey || (scriptTag && scriptTag.getAttribute('data-key')) || '';
  if (!apiKey) console.warn('[Aether] No API key — set window.AetherConfig.apiKey or data-key on the script tag.');

  var PROCESSED = 'data-aether-processed';
  // Common AI chat response selectors across ChatGPT, Claude, Gemini, Copilot, and generic chat UIs.
  var SELECTORS = [
    '[data-message-author-role="assistant"]',
    '[data-testid*="conversation-turn"]:not([data-testid*="user"])',
    '[data-testid*="assistant"]',
    '[data-message]',
    '.markdown.prose',
    '.prose:not(.prose-invert)',
    '.message-content',
    '[class*="agent-message"]',
    '[class*="markdown"]',
    'article',
  ];

  function extractText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('button, .aether-verify-btn, .aether-card, svg').forEach(function (n) { n.remove(); });
    return (clone.innerText || clone.textContent || '').trim();
  }

  function findMessages() {
    var found = [];
    SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (el.hasAttribute(PROCESSED)) return;
          if (el.closest('.aether-card') || el.closest('.aether-verify-btn')) return;
          // Avoid tiny / nested duplicates — skip if an ancestor already matched.
          if (el.parentElement && el.parentElement.closest('[' + PROCESSED + ']')) { el.setAttribute(PROCESSED, ''); return; }
          var text = extractText(el);
          if (text.length > 60) { el.setAttribute(PROCESSED, ''); found.push(el); }
        });
      } catch (e) { /* selector unsupported */ }
    });
    return found;
  }

  function toneColor(t) { return t >= 75 ? '#34d399' : t >= 50 ? '#fbbf24' : '#fb7185'; }
  function verdictLabel(v) { return v === 'verified' ? 'Verified' : v === 'contested' ? 'Contested' : 'Rejected'; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  function injectButton(el) {
    var btn = document.createElement('button');
    btn.className = 'aether-verify-btn';
    btn.type = 'button';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verify with Aether';
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', gap: '5px', margin: '8px 0 0 0',
      padding: '4px 10px', fontSize: '12px', fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: '500',
      color: '#070A0F', background: 'linear-gradient(135deg,#34d399,#0d9488)', border: '0', borderRadius: '7px',
      cursor: 'pointer', lineHeight: '1.4',
    });
    btn.addEventListener('click', function () { verify(el, btn); });
    el.appendChild(btn);
  }

  function setLoading(btn, on) {
    if (on) {
      btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(7,10,15,.4);border-top-color:#070A0F;border-radius:50%;animation:aether-spin .7s linear infinite"></span> Tribunal running...';
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  }

  function renderCard(anchor, data) {
    var existing = anchor.parentElement.querySelector(':scope > .aether-card');
    if (existing) existing.remove();
    var t = data.trust_score || 0;
    var tone = toneColor(t);
    var card = document.createElement('div');
    card.className = 'aether-card';
    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<div style="width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#34d399,#0d9488);display:flex;align-items:center;justify-content:center;color:#070A0F;font-weight:700;font-size:10px">A</div>' +
        '<span style="font-weight:600;font-size:12px;color:#fff">Aether verdict</span>' +
        '<span style="font-size:10px;color:' + tone + ';margin-left:auto;font-weight:600">● ' + verdictLabel(data.verdict) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div><div style="font-size:26px;font-weight:700;color:' + tone + ';line-height:1">' + t + '<span style="font-size:12px;color:#64748b">/100</span></div></div>' +
        '<div style="flex:1;height:5px;border-radius:99px;background:#1f2937;overflow:hidden"><div style="height:100%;width:' + Math.max(2, t) + '%;background:' + tone + ';border-radius:99px"></div></div>' +
      '</div>' +
      (data.corrections && data.corrections.length ?
        '<div style="margin-top:9px;border-top:1px solid #1f2937;padding-top:8px"><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#fb7185;margin-bottom:4px">Issues found (' + data.corrections.length + ')</div>' +
        data.corrections.slice(0, 3).map(function (c) { return '<div style="font-size:11px;color:#94a3b8;margin-bottom:3px">• ' + escapeHtml(c) + '</div>'; }).join('') + '</div>' : '') +
      '<a href="' + escapeHtml(origin + (data.tribunal_url || ('/verify/' + (data.lineage_id || '')))) + '" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;font-size:11px;color:#34d399;text-decoration:none">View full tribunal debate →</a>';
    Object.assign(card.style, {
      fontFamily: 'system-ui, -apple-system, sans-serif', marginTop: '8px', padding: '12px 14px',
      background: '#0B0F16', color: '#e2e8f0', border: '1px solid #1f2937', borderRadius: '12px',
      maxWidth: '420px', boxShadow: '0 8px 30px rgba(0,0,0,.4)', fontSize: '12px',
    });
    anchor.parentElement.insertBefore(card, anchor.nextSibling);
  }

  function showError(el, msg) {
    var existing = el.parentElement.querySelector(':scope > .aether-card');
    if (existing) existing.remove();
    var n = document.createElement('div');
    n.className = 'aether-card';
    n.textContent = 'Aether: ' + msg;
    Object.assign(n.style, { marginTop: '8px', padding: '10px 12px', background: '#0B0F16', color: '#fb7185', border: '1px solid #1f2937', borderRadius: '10px', fontSize: '12px', fontFamily: 'system-ui, sans-serif', maxWidth: '420px' });
    el.parentElement.insertBefore(n, el.nextSibling);
    setTimeout(function () { n.remove(); }, 5000);
  }

  function verify(el, btn) {
    var text = extractText(el);
    if (!text) return;
    setLoading(btn, true);
    fetch(origin + '/functions/verifyResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ text: text, source: 'widget' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setLoading(btn, false);
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verify with Aether';
        if (d.error) showError(el, d.error); else renderCard(el, d);
      })
      .catch(function (e) {
        setLoading(btn, false);
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verify with Aether';
        showError(el, String(e && e.message || e));
      });
  }

  function scan() { findMessages().forEach(injectButton); }

  // inject spinner keyframes once
  var style = document.createElement('style');
  style.textContent = '@keyframes aether-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);

  scan();
  var mo = new MutationObserver(function () { scan(); });
  mo.observe(document.body, { childList: true, subtree: true });
  setInterval(scan, 3000);
})();
