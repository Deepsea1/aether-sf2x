// Aether Extension — Popup Script
// External file: MV3's extension-page CSP (script-src 'self') blocks inline scripts

// Load saved API key
chrome.storage.sync.get(['aetherApiKey', 'stats'], (data) => {
  if (data.aetherApiKey) {
    document.getElementById('apiKey').value = data.aetherApiKey;
    document.getElementById('status').className = 'status ok';
    document.getElementById('status').textContent = '✓ API key set';
  }
  if (data.stats) {
    document.getElementById('verifiedCount').textContent = data.stats.verified || 0;
    document.getElementById('avgTrust').textContent = data.stats.avgTrust || '—';
    document.getElementById('flaggedCount').textContent = data.stats.flagged || 0;
  }
});

// Save API key
document.getElementById('save').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  chrome.storage.sync.set({ aetherApiKey: key }, () => {
    document.getElementById('status').className = 'status ok';
    document.getElementById('status').textContent = '✓ API key saved';
  });
});
