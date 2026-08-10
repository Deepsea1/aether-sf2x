// Aether — The Truth Layer for AI
// Chrome Extension: Content Script (Manifest V3)
// Injects a "Verify with Aether" button next to AI chat responses
//
// P1 emergency-hardening pass: API-derived strings are never rendered via
// innerHTML, verification runs in the background service worker (this script
// never reads the API key), and text is re-extracted at click time. The §22.1
// binding work (content hashing, MutationObserver invalidation, shadow DOM,
// adapter registry) is scheduled for P3.

(function() {
  'use strict';

  const AETHER_ORIGIN = 'https://aether.sf2x.com';
  const AETHER_COLOR = '#6366f1';

  // Supported AI chat sites
  const SUPPORTED_SITES = [
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'copilot.microsoft.com',
    'www.perplexity.ai',
    'poe.com',
    'character.ai'
  ];

  function isSupportedSite() {
    return SUPPORTED_SITES.some(s => window.location.hostname.includes(s));
  }

  if (!isSupportedSite()) return;

  // Detect AI response containers on each supported site
  function getResponseSelectors() {
    const host = window.location.hostname;
    if (host.includes('chatgpt') || host.includes('openai')) {
      return ['[data-message-author-role="assistant"]', '.markdown'];
    }
    if (host.includes('claude')) {
      return ['[data-testid="assistant-message"]', '.font-claude-message'];
    }
    if (host.includes('gemini')) {
      return ['.response-container', 'model-response'];
    }
    if (host.includes('copilot')) {
      return ['.cib-serp-main', '.ac-container'];
    }
    return ['.message', '[data-role="assistant"]', 'article'];
  }

  function extractResponseText(container) {
    // Get all text content, preserving structure
    const clone = container.cloneNode(true);
    // Remove buttons, inputs, etc. — including our own injected UI, so a
    // click-time re-extraction never picks up a previous verdict card
    clone.querySelectorAll('button, input, script, style, .aether-verify-btn, .aether-verdict-card').forEach(el => el.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ').slice(0, 5000);
  }

  function createVerifyButton(container) {
    // Don't double-inject
    if (container.querySelector('.aether-verify-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'aether-verify-btn';
    btn.textContent = '✓ Verify with Aether';
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      margin-top: 8px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 600;
      color: ${AETHER_COLOR};
      background: transparent;
      border: 1px solid ${AETHER_COLOR};
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s;
      opacity: 0.7;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.background = `${AETHER_COLOR}10`;
    });

    btn.addEventListener('mouseleave', () => {
      if (!btn.classList.contains('aether-verified')) {
        btn.style.opacity = '0.7';
        btn.style.background = 'transparent';
      }
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.textContent = '⟳ Tribunal running...';
      btn.style.opacity = '1';
      btn.style.cursor = 'wait';

      try {
        // Re-extract at click time — injection-time text is typically mid-stream
        const text = extractResponseText(container);
        if (text.length <= 50) throw new Error('Response text too short to verify');

        // Verification runs in the background worker so the page never sees the API key
        const response = await chrome.runtime.sendMessage({
          type: 'VERIFY',
          text: text,
          source: window.location.hostname
        });

        if (!response || !response.success) {
          throw new Error((response && response.error) || 'Verification failed');
        }

        showVerdictCard(container, response.data);
        updateButton(btn, response.data);
      } catch (err) {
        btn.textContent = '⚠ Verify failed';
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
        setTimeout(() => {
          btn.textContent = '✓ Verify with Aether';
          btn.style.borderColor = AETHER_COLOR;
          btn.style.color = AETHER_COLOR;
          btn.style.opacity = '0.7';
        }, 3000);
      }
    });

    container.appendChild(btn);
  }

  function updateButton(btn, result) {
    const score = Number(result.trust_score) || 0;
    btn.classList.add('aether-verified');

    let color, label;
    if (score >= 75) {
      color = '#22c55e';
      label = `✓ Verified ${score}/100`;
    } else if (score >= 50) {
      color = '#eab308';
      label = `⚠ Contested ${score}/100`;
    } else {
      color = '#ef4444';
      label = `✗ Rejected ${score}/100`;
    }

    btn.textContent = label;
    btn.style.borderColor = color;
    btn.style.color = color;
    btn.style.opacity = '1';
    btn.style.background = `${color}10`;
  }

  // §22.1 staleness display (first slice): humanize a cache age in seconds.
  // Non-numeric/negative ages fail closed to 0s — the result stays labeled cached.
  function humanizeCacheAge(seconds) {
    const s = Number(seconds);
    const safe = Number.isFinite(s) && s >= 0 ? Math.round(s) : 0;
    if (safe < 90) return `${safe}s`;
    if (safe < 90 * 60) return `${Math.round(safe / 60)}m`;
    return `${Math.round(safe / 3600)}h`;
  }

  function showVerdictCard(container, result) {
    // Remove existing card
    const existing = container.querySelector('.aether-verdict-card');
    if (existing) existing.remove();

    // API-derived values are rendered via textContent only — never innerHTML
    const score = Number(result.trust_score) || 0;
    const corrections = Array.isArray(result.corrections)
      ? result.corrections.filter(c => typeof c === 'string')
      : [];

    let color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
    let verdictLabel = score >= 75 ? 'Verified' : score >= 50 ? 'Contested' : 'Rejected';

    const card = document.createElement('div');
    card.className = 'aether-verdict-card';
    card.style.cssText = `
      margin-top: 8px;
      padding: 12px 16px;
      border: 1px solid ${color};
      border-radius: 8px;
      background: ${color}08;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      max-width: 500px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 4px;';

    const scoreEl = document.createElement('span');
    scoreEl.style.cssText = `font-size: 18px; font-weight: 700; color: ${color};`;
    scoreEl.textContent = `${score}/100`;
    header.appendChild(scoreEl);

    const verdictEl = document.createElement('span');
    verdictEl.style.cssText = `font-weight: 600; color: ${color};`;
    verdictEl.textContent = verdictLabel;
    header.appendChild(verdictEl);

    const badgeEl = document.createElement('span');
    badgeEl.style.cssText = 'color: #94a3b8; font-size: 11px; margin-left: auto;';
    badgeEl.textContent = 'Aether Tribunal';
    header.appendChild(badgeEl);

    card.appendChild(header);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'color: #64748b; font-size: 12px;';
    subtitle.textContent = 'Verified by 3-model tribunal (proposer → critic → verifier)';
    card.appendChild(subtitle);

    const stamp = document.createElement('div');
    stamp.style.cssText = 'margin-top: 4px; color: #94a3b8; font-size: 11px;';
    if (result.cached === true) {
      // Cache hits from verifyResponse are labeled honestly rather than re-stamped
      stamp.textContent = `Cached result (age ${humanizeCacheAge(result.cache_age_seconds)}) — verified content unchanged since first check`;
    } else {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      stamp.textContent = `Verified ${time} — reflects the text at verification time`;
    }
    card.appendChild(stamp);

    if (corrections.length > 0) {
      const issues = document.createElement('div');
      issues.style.cssText = `margin-top: 8px; padding-top: 8px; border-top: 1px solid ${color}30;`;

      const issuesLabel = document.createElement('div');
      issuesLabel.style.cssText = `font-weight: 600; color: ${color}; margin-bottom: 4px;`;
      issuesLabel.textContent = 'Issues found:';
      issues.appendChild(issuesLabel);

      const list = document.createElement('ul');
      list.style.cssText = 'margin: 0; padding-left: 20px; color: #475569;';
      corrections.forEach(c => {
        const item = document.createElement('li');
        item.style.cssText = 'margin-bottom: 4px;';
        item.textContent = c;
        list.appendChild(item);
      });
      issues.appendChild(list);

      card.appendChild(issues);
    }

    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top: 8px; font-size: 11px; color: #94a3b8;';

    // Only link when the API returned a well-formed relative tribunal path;
    // the href is always anchored to the known Aether origin
    const tribunalPath = typeof result.tribunal_url === 'string' &&
      /^\/verify\/[A-Za-z0-9_-]+$/.test(result.tribunal_url)
      ? result.tribunal_url
      : null;
    if (tribunalPath) {
      const link = document.createElement('a');
      link.href = `${AETHER_ORIGIN}${tribunalPath}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = `color: ${AETHER_COLOR}; text-decoration: none;`;
      link.textContent = 'View full tribunal debate →';
      footer.appendChild(link);
    } else {
      footer.textContent = 'Powered by Aether — The Truth Layer for AI';
    }
    card.appendChild(footer);

    container.appendChild(card);
  }

  // Observe DOM for new AI responses (chat interfaces are dynamic)
  function scanForResponses() {
    const selectors = getResponseSelectors();
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = extractResponseText(el);
        if (text.length > 50) { // Only inject for substantial responses
          createVerifyButton(el);
        }
      });
    });
  }

  // Initial scan
  setTimeout(scanForResponses, 2000);

  // Watch for new messages being added
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) shouldScan = true;
    });
    if (shouldScan) {
      clearTimeout(window.__aetherScanTimeout);
      window.__aetherScanTimeout = setTimeout(scanForResponses, 1000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log('%c✓ Aether — Truth Layer for AI', `color: ${AETHER_COLOR}; font-weight: bold;`);
  console.log('Verify buttons injected. Click ✓ Verify on any AI response to run the tribunal.');
})();
