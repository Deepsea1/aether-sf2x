// End-to-end proof for the .mcpb bundle: spawn the SAME command line the extension
// declares, do a real MCP initialize + tools/list against the live worker.
// Token read disk->memory from Claude Code user scope; all output masked.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const cc = JSON.parse(fs.readFileSync('C:\\Users\\campi\\.claude.json', 'utf8'));
const secret = cc.mcpServers && cc.mcpServers.aether && cc.mcpServers.aether.env && cc.mcpServers.aether.env.AETHER_AUTH_HEADER;
if (!secret) { console.log('FAIL: no live header value in user scope'); process.exit(1); }
const mask = s => String(s).split(secret).join('***MASKED***').replace(/sk_[A-Za-z0-9_\-]+/g, 'sk_***').replace(/(Bearer[ :]{0,2})[A-Za-z0-9._\-]{8,}/g, '$1***');

const child = spawn(process.execPath, [
  path.join(__dirname, 'node_modules', 'mcp-remote', 'dist', 'proxy.js'),
  'https://aether-mcp.campiper84.workers.dev',
  '--header', 'Authorization:${AETHER_AUTH_HEADER}'
], { env: { ...process.env, AETHER_AUTH_HEADER: secret } });

let out = '', err = '', sentFollowups = false, tools = null;
const send = obj => child.stdin.write(JSON.stringify(obj) + '\n');

child.stdout.on('data', d => {
  out += d;
  for (const line of out.split('\n')) {
    const t = line.trim(); if (!t) continue;
    let m; try { m = JSON.parse(t); } catch (e) { continue; }
    if (m.id === 1 && m.result && !sentFollowups) {
      sentFollowups = true;
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    }
    if (m.id === 2 && m.result && !tools) {
      tools = (m.result.tools || []).map(x => x.name);
      finish(0);
    }
  }
});
child.stderr.on('data', d => { err += d; });

let done = false;
function finish(code) {
  if (done) return; done = true;
  clearTimeout(timer);
  console.log('TOOLS:', tools ? tools.join(', ') : '(none)');
  const pass = tools && tools.includes('verify_claim');
  console.log('VERDICT:', pass ? 'PASS - bundle bridge speaks MCP to the live worker and lists the verify tools' : 'FAIL');
  console.log('stderr (masked, first 12 lines):');
  mask(err).split('\n').filter(x => x.trim()).slice(0, 12).forEach(l => console.log('  ' + l.slice(0, 200)));
  try { child.kill(); } catch (e) {}
  process.exit(pass ? 0 : 1);
}
const timer = setTimeout(() => { console.log('TIMEOUT after 60s'); finish(1); }, 60000);

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcpb-test', version: '1.0.0' } } });
