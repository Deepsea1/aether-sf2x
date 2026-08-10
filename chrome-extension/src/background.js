// Aether Extension — Background Service Worker
// Handles API calls and message passing

chrome.runtime.onInstalled.addListener(() => {
  console.log('Aether — Truth Layer for AI installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only accept messages from this extension's own tab-bound content scripts
  if (!sender || sender.id !== chrome.runtime.id || !sender.tab) return;

  if (request && request.type === 'VERIFY') {
    if (typeof request.text !== 'string' || request.text.length === 0) {
      sendResponse({ success: false, error: 'Invalid text' });
      return;
    }
    const text = request.text.slice(0, 5000);
    const source = typeof request.source === 'string' ? request.source : '';
    verifyResponse(text, source)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

async function verifyResponse(text, source) {
  const { aetherApiKey } = await chrome.storage.sync.get('aetherApiKey');
  const API = 'https://aether.sf2x.com/api/functions/verifyResponse';

  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(aetherApiKey ? { 'x-api-key': aetherApiKey } : {})
    },
    body: JSON.stringify({ text, source, domain: 'verification' })
  });

  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}
