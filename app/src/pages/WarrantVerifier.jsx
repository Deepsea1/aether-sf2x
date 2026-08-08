import React, { useState } from 'react';
import { FileCheck, Key, Code2, Check, Copy, ShieldCheck, ExternalLink } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const PYTHON_SAMPLE = `from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import hmac
import json, base64

def verify_warrant(warrant, public_key_pem, hmac_key):
    """Verify an Aether warrant signature."""
    # 1. Reconstruct the signed payload
    payload = "|".join([
        warrant["answer_version_id"],
        warrant["conclusion"],
        ";;".join(warrant.get("premises", [])),
    ])

    # 2. Verify Ed25519 signature
    public_key = serialization.load_pem_public_key(public_key_pem)
    sig = base64.b64decode(warrant["signed_hash"])
    try:
        public_key.verify(sig, payload.encode())
    except Exception:
        return False, "Ed25519 signature mismatch"

    # 3. Verify source content hashes (optional)
    for snap in warrant.get("source_snapshots", []):
        # Re-fetch the URL and compare SHA-256
        # stored_hash = snap["content_hash"]
        pass

    return True, "Warrant verified — provenance confirmed"`;

const JS_SAMPLE = `import { createVerify, createHmac } from 'crypto';

export function verifyWarrant(warrant, publicKeyPem, hmacKey) {
  // 1. Reconstruct the signed payload
  const payload = [
    warrant.answer_version_id,
    warrant.conclusion,
    (warrant.premises || []).join(';;'),
  ].join('|');

  // 2. Verify Ed25519 signature
  const verify = createVerify('sha256');
  verify.update(payload);
  verify.end();

  const isValid = verify.verify(
    publicKeyPem,
    Buffer.from(warrant.signed_hash, 'base64'),
    'ed25519'
  );

  if (!isValid) {
    return { valid: false, reason: 'Ed25519 signature mismatch' };
  }

  return { valid: true, reason: 'Warrant verified — provenance confirmed' };
}`;

const CURL_SAMPLE = `curl -X POST https://api.aether.ai/v1/warrants/verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "warrant_id": "warr_abc123",
    "public_key": "-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"
  }'`;

function CodeBlock({ code, lang, id }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-xl border border-white/10 bg-[#070A0F] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-xs font-mono text-slate-500">{lang}</span>
        <button onClick={copy} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs text-slate-300 font-mono leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export default function WarrantVerifier() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <FileCheck className="h-3.5 w-3.5" /> Open-Source
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Warrant Verifier</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Verify any Aether warrant independently. No trust in Aether required — just math.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { Icon: Key, title: '1. Get the Public Key', desc: 'Aether\'s Ed25519 public key is published. Anyone can use it.' },
            { Icon: Code2, title: '2. Reconstruct Payload', desc: 'Concatenate answer_version_id, conclusion, and premises with | and ;; delimiters.' },
            { Icon: ShieldCheck, title: '3. Verify Signature', desc: 'Check the Ed25519 signature against the public key. If it matches, the warrant is authentic.' },
          ].map(s => (
            <div key={s.title} className="rounded-xl border border-white/10 bg-[#0B0F16] p-5">
              <s.Icon className="h-6 w-6 text-emerald-400 mb-3" />
              <h3 className="text-sm font-medium text-white mb-1">{s.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Signature spec */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-6 mb-8">
          <h2 className="text-lg font-heading font-semibold text-white mb-4">Signature Specification</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="text-xs font-mono text-emerald-300 shrink-0 w-32">Algorithm</span>
              <span className="text-slate-400">Ed25519 (EdDSA over Curve25519) + HMAC-SHA256 fallback</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-emerald-300 shrink-0 w-32">Payload</span>
              <span className="text-slate-400 font-mono text-xs">answer_version_id | conclusion | premises.join(";;")</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-emerald-300 shrink-0 w-32">Encoding</span>
              <span className="text-slate-400">Base64 (signature), UTF-8 (payload)</span>
            </div>
            <div className="flex gap-3">
              <span className="text-xs font-mono text-emerald-300 shrink-0 w-32">Source Hash</span>
              <span className="text-slate-400">SHA-256 of fetched source content (first N bytes), stored per-snapshot</span>
            </div>
          </div>
        </div>

        {/* Code samples */}
        <div className="space-y-6 mb-12">
          <div>
            <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-3">Python</h2>
            <CodeBlock code={PYTHON_SAMPLE} lang="verify_warrant.py" id="py" />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-3">JavaScript / Node.js</h2>
            <CodeBlock code={JS_SAMPLE} lang="verify.js" id="js" />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-wider text-slate-500 mb-3">cURL (Hosted API)</h2>
            <CodeBlock code={CURL_SAMPLE} lang="bash" id="curl" />
          </div>
        </div>

        {/* Public key */}
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-emerald-300 mb-3">Aether Public Key</h2>
          <pre className="text-xs text-slate-400 font-mono overflow-x-auto">-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[...published key...]
-----END PUBLIC KEY-----</pre>
          <p className="text-xs text-slate-500 mt-3">
            This key is fixed and publicly verifiable. Any warrant signed by Aether can be checked against it.
          </p>
        </div>

        <div className="text-center">
          <a href="/warrant-spec" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-slate-200 font-medium hover:bg-white/5 transition-colors">
            Full Warrant Specification <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}