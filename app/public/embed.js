// Aether embeddable trust badge — drop-in script.
// Usage: <script src="https://aether.sf2x.ai/embed.js" data-id="<warrant_id>" data-style="full"></script>
// Styles: full (default) | compact | pill | score
// Renders an iframe pointing at /embed/badge/:id so the badge is style-isolated
// and always reflects the live trust score. The iframe links back to aether.sf2x.ai.
//
// Display eligibility (§20 anti-laundering): bind the badge to the EXACT text it
// sits beside via data-content-sha256="<lowercase SHA-256 hex>" (or
// data-content="<the text>", hashed locally with WebCrypto — only the digest
// ever leaves the page, never the content). The script then asks the public
// registry (warrantRegistry?op=eligibility) whether that hash still carries
// this warrant: eligible -> the normal badge; anything else -> a grey
// struck-out state, never the green badge (§25.3). The hash must match the
// answer text AS PERSISTED — API/widget-path warrants persist only the first
// 4,000 characters; see hash_recipe in the op response for the exact rules.
(function () {
  var s = document.currentScript;
  if (!s) return;
  var id = s.getAttribute('data-id');
  var style = s.getAttribute('data-style') || 'full';
  var origin = s.src.replace(/\/embed\.js.*$/, '');
  if (!id) return;
  var host = document.createElement('div');
  host.className = 'aether-badge';
  host.style.display = 'inline-block';
  s.parentNode.insertBefore(host, s);

  function renderBadge() {
    var f = document.createElement('iframe');
    f.src = origin + '/embed/badge/' + encodeURIComponent(id) + '?style=' + encodeURIComponent(style);
    f.title = 'Aether trust badge';
    f.scrolling = 'no';
    f.frameBorder = '0';
    f.style.border = '0';
    f.style.background = 'transparent';
    f.style.overflow = 'hidden';
    if (style === 'pill') { f.style.width = '150px'; f.style.height = '30px'; }
    else if (style === 'score') { f.style.width = '130px'; f.style.height = '90px'; }
    else if (style === 'compact') { f.style.width = '240px'; f.style.height = '160px'; }
    else { f.style.width = '340px'; f.style.height = '230px'; }
    host.appendChild(f);
  }

  // The honest not-eligible state — grey, struck-out, never the green badge
  // (§25.3: never green for stale/invalidated/superseded/disputed). Links to
  // the public proof page so the reader can see what the warrant DOES cover.
  function renderIneligible(message) {
    var a = document.createElement('a');
    a.href = origin + '/warrant-proof?q=' + encodeURIComponent(id);
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.style.display = 'inline-flex';
    a.style.alignItems = 'center';
    a.style.gap = '6px';
    a.style.padding = '4px 10px';
    a.style.border = '1px solid #4b5563';
    a.style.borderRadius = '7px';
    a.style.background = '#1f2937';
    a.style.color = '#9ca3af';
    a.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    a.style.fontSize = '12px';
    a.style.lineHeight = '1.4';
    a.style.textDecoration = 'none';
    var struck = document.createElement('span');
    struck.textContent = 'Aether verified';
    struck.style.textDecoration = 'line-through';
    struck.style.opacity = '0.7';
    var note = document.createElement('span');
    note.textContent = message;
    a.appendChild(struck);
    a.appendChild(note);
    host.appendChild(a);
  }

  function checkAndRender(hex) {
    // The registry lookup ladder tries warrant_id, then signed_hash, then
    // lineage_id — pass the id in every slot it could be, exactly like the
    // proof page does with its sf2x_ prefix check.
    var lookup = id.indexOf('sf2x_') === 0
      ? 'signed_hash=' + encodeURIComponent(id)
      : 'warrant_id=' + encodeURIComponent(id) + '&lineage_id=' + encodeURIComponent(id);
    fetch(origin + '/api/functions/warrantRegistry?op=eligibility&' + lookup + '&content_sha256=' + encodeURIComponent(hex))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.eligible === true) renderBadge();
        else renderIneligible('verification no longer matches this content');
      })
      .catch(function () {
        // Fail closed: an unreachable eligibility check never earns the green
        // badge — the binding was requested and could not be confirmed.
        renderIneligible('verification could not be checked for this content');
      });
  }

  if (!s.hasAttribute('data-content-sha256') && !s.hasAttribute('data-content')) {
    // Unbound embed — no content (or hash) provided, so laundering (the page
    // editing the text while keeping the badge) CANNOT be detected here: the
    // badge attests the warrant, not the surrounding text. Behavior unchanged.
    renderBadge();
    return;
  }

  var contentSha = (s.getAttribute('data-content-sha256') || '').trim().toLowerCase();
  if (contentSha) {
    checkAndRender(contentSha);
  } else if (s.hasAttribute('data-content') && window.crypto && window.crypto.subtle && window.TextEncoder) {
    // Hash locally — the content itself never leaves the page.
    window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.getAttribute('data-content') || ''))
      .then(function (buf) {
        var arr = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < arr.length; i++) hex += (arr[i] < 16 ? '0' : '') + arr[i].toString(16);
        checkAndRender(hex);
      })
      .catch(function () { renderIneligible('verification could not be checked for this content'); });
  } else {
    // Binding requested but uncomputable (empty hash attribute, or no
    // WebCrypto in an insecure context). Fail closed, never the green badge.
    renderIneligible('verification could not be checked for this content');
  }
})();
