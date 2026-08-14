# Aether by SF2X — Developer Documentation

## Overview

Aether by SF2X provides real-time AI trust verification through a 3-model tribunal architecture. This documentation covers all available API endpoints, integration patterns, and code examples.

## Base URL

```
https://aether.sf2x.com/api/functions/
```

## Authentication

All API requests require a valid API key, sent in the **`x-api-key`** header:

```bash
x-api-key: YOUR_API_KEY
```

Get your API key from the Aether dashboard at https://aether.sf2x.com/api-docs.

> **Corrected 2026-08-09.** This previously documented `Authorization: Bearer
> YOUR_API_KEY`, which the API does not accept — it answers
> `401 {"error":"Missing x-api-key header"}`. The base URL above was corrected in the
> same pass: the old `api.base44.com/apps/<id>/backend/functions/` base returns **404
> with an HTML error page** for every function.

## Endpoint status

Re-probed 2026-08-09 (later the same day) against the base URL above. **All four are
live.**

| Endpoint | Status |
|---|---|
| `/verifyResponse` | ✅ Live — `200` with a real tribunal verdict |
| `/batchVerify` | ✅ Live — `401 "Missing x-api-key header"` without a key (present and auth-gated) |
| `/webhookVerify` | ✅ Live — `401` without a key |
| `/warrantApi` | ✅ Live — `401` without a key |

> **Earlier today this table said otherwise, and it was right at the time.**
> `/batchVerify` and `/webhookVerify` answered `404 "Backend function … not found or
> not deployed"`, and `/verifyResponse` answered `500 "Permission denied for create
> operation on Inquiry entity"`. All three were fixed on the Base44 side. The
> distinction that matters when re-checking: a **`404` naming the function** means it
> is not deployed, whereas a **`401` asking for `x-api-key`** means it is deployed and
> simply wants a key.

💸 **`/batchVerify` now meters per text (2 credits × N) and caps batches per plan** —
the un-metered 50× cost multiplier previously documented here was closed by the
2026-08-10 deploy. See its section below.

## Endpoints

### 1. Verify Response (Single)

**POST** `/verifyResponse`

Verify a single text response for hallucinations.

**Request:**
```json
{
  "text": "According to Section 4.1 of the employee handbook, employees receive 15 vacation days in their first year."
}
```

**Response:**
```json
{
  "trust_score": 40,
  "verdict": "contested",
  "truth_status": "UNKNOWN",
  "evidence_basis": "MODEL_ASSESSED",
  "proof_level": "L1",
  "integrity_status": "UNSEALED",
  "action_authorization": "NOT_AUTHORIZED",
  "corrections": [
    "Cite the specific employer and provide the exact text or link to Section 4.1...",
    "Do not state absolute standards across all companies..."
  ],
  "claims": [
    {
      "claim": "According to Section 4.1...",
      "supported": false,
      "notes": "No source or employer is cited..."
    }
  ],
  "warrant_id": "6a6de04b26cf84c8aa37847f",
  "tribunal_url": "/verify/6a6de04b14738e49e8db0ee0",
  "lineage_id": "6a6de04b14738e49e8db0ee0",
  "latency_ms": 14255
}
```

`trust_score` and legacy `verdict` are model-assessment display fields on this
fast path. They do not establish a factual `VERIFIED` status and never authorize
an action. Use the five canonical truth fields for decisions.

**Example (curl):**
```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AETHER_API_KEY" \
  -d '{"text": "Your text to verify here"}'
```

### 2. Batch Verify

> ✅ **Deployed** (re-probed 2026-08-09).
>
> ✅ **Corrected 2026-08-10 — the metering hole is closed.** The cost warning that
> stood here ("live and un-metered per text", a 50× spend multiplier) described the
> old directly-deployed function, and it was right at the time. The guarded
> implementation (`app/base44/functions/batchVerify/entry.ts`) was deployed to
> Base44 on 2026-08-10, and all three fixes the old warning asked for landed
> together. What the deployed code does:
>
> - **Meters per text, not per request.** A batch of N texts charges **2 × N
>   credits** against the same monthly quota as `/verifyResponse` (2 credits per
>   text). The 50× multiplier is arithmetic now: 50 texts cost 100 credits.
>   Per-item provider failures keep their slot in `results` (as
>   `{ "index", "text_preview", "word_count", "error" }`) and are excluded from
>   the summary counts and the average, but every text that entered the run is
>   billed. Blank entries are dropped before the run (never billed); surviving
>   items keep their original `index`.
> - **Caps batch size by plan.** Free **5** · Starter **20** · every other plan
>   **50** (the absolute maximum). Unknown plans fail closed to the Free cap.
>   Over the plan cap → `400` with the reason
>   `"The <plan> plan allows at most <cap> items per batch (received <count>). Split the batch or upgrade the plan."`
>   More than 50 texts is rejected with `400 "Max 50 texts per batch"` regardless
>   of plan — never silently truncated.
> - **Rejects insufficient headroom with `429`.** The whole batch must fit the
>   remaining monthly credits **before** any tribunal call runs. When 2 × N
>   exceeds the remaining credits: `429` with
>   `"This batch needs <cost> credits but only <left> remain in the monthly quota for the <plan> plan. The batch was not run and nothing was charged."`
>   An already-exhausted quota answers
>   `429 "Monthly verification quota exceeded"`. Either way, a rejected batch
>   runs nothing and charges nothing.
>
> The same whole-batch headroom rule now governs the other batch endpoints:
> `/batchWarrant` (≤ 25 answers, 5 credits per item — `413` over 25) retired its
> old "overshoot-once" allowance, where 1 remaining credit admitted a full batch;
> it now answers `429` when the batch cost exceeds the remaining credits, running
> nothing and charging nothing. `/verifyBatch` (the retroactive-audit endpoint,
> ≤ 10 items) applies the identical pre-run check.

**POST** `/batchVerify`

Verify multiple texts in a single request (max 50 per batch).

**Request:**
```json
{
  "texts": [
    "First text to verify",
    "Second text to verify",
    "Third text to verify"
  ],
  "options": {
    "model": "gpt-4o"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "index": 0,
      "text_preview": "First text to verify...",
      "trust_score": 85,
      "verdict": "verified",
      "flags": [],
      "word_count": 5
    },
    {
      "index": 1,
      "text_preview": "Second text to verify...",
      "trust_score": 40,
      "verdict": "contested",
      "flags": ["Unverified citation reference detected"],
      "word_count": 5
    }
  ],
  "summary": {
    "total": 3,
    "verified": 1,
    "contested": 1,
    "rejected": 1,
    "average_trust_score": 58,
    "batch_verdict": "contested"
  }
}
```

**Example (Python):**
```python
import requests

response = requests.post(
    "https://aether.sf2x.com/api/functions/batchVerify",
    json={
        "texts": [
            "According to Section 4.1, employees get 15 days off.",
            "This is standard across all companies in the US.",
            "You should check with your HR department for specifics."
        ]
    },
    headers={"Content-Type": "application/json", "x-api-key": API_KEY}
)

data = response.json()
print(f"Batch verdict: {data['summary']['batch_verdict']}")
print(f"Average trust score: {data['summary']['average_trust_score']}/100")
```

### 3. Webhook Verification

> ✅ **Deployed** (re-probed 2026-08-09). Cost-safe: **one tribunal run per call**, the
> same spend as `/verifyResponse`, with no batching multiplier.
>
> ✅ **Corrected 2026-08-10 — the SSRF item is confirmed closed.** The caution that
> stood here ("this has not been verified against the deployed function") was
> written when `/webhookVerify` existed only as a directly-deployed function with
> no source in this repo. The in-repo implementation
> (`app/base44/functions/webhookVerify/entry.ts`) went to Base44 on 2026-08-10,
> behind the shared SSRF guard (`app/base44/shared/webhooks.js`). What the
> deployed code does:
>
> - **Requires an API key.** `401` without one, `403` for an invalid or inactive
>   key — delivery to arbitrary URLs is never anonymous.
> - **Validates `webhook_url` BEFORE any LLM spend.** Scheme allowlist
>   (`http:`/`https:` only), rejection of URLs with embedded credentials, and a
>   blocklist covering loopback, private ranges (10/8, 172.16/12, 192.168/16),
>   link-local, CGNAT (100.64/10), IPv6 loopback/unique-local/link-local (incl.
>   IPv4-mapped), and cloud-metadata hosts (`169.254.169.254`,
>   `metadata.google.internal`, …). Hostnames are DNS-resolved and every resolved
>   IP re-checked; an unresolvable hostname is blocked (**fail closed**). A
>   blocked or malformed URL answers `400 "invalid webhook_url: <reason>"` and
>   nothing is run or charged.
> - **Never auto-follows redirects.** Delivery goes through a guarded POST that
>   follows redirects manually, re-validating every `Location` hop against the
>   same blocklist, capped at 5 hops — a `302` to an internal address is blocked,
>   not followed.
> - **Reports delivery failure honestly.** If the webhook POST fails after the
>   verification ran, the response is
>   `502 { "status": "webhook_failed", "webhook_error": …, "verification": … }` —
>   the verification result is still returned (and billed), and the status is
>   never claimed as `webhook_sent`. On success:
>   `200 { "status": "webhook_sent", "webhook_status": <delivery HTTP status>, "verification": … }`.
>
> Billing is unchanged: one tribunal run per call, 2 credits, metered against the
> same quota as `/verifyResponse`. A verdict-cache hit (see "Caching & verdict
> reuse" below) skips the tribunal, bills **0** credits, still fires the webhook,
> and marks the response `cached: true`.

**POST** `/webhookVerify`

Verify text and send results to a webhook URL (async pattern).

**Request:**
```json
{
  "webhook_url": "https://your-app.com/webhook/aether",
  "text": "Text to verify",
  "verification_id": "optional-custom-id"
}
```

**Response:**
```json
{
  "status": "webhook_sent",
  "webhook_status": 200,
  "verification": {
    "verification_id": "vrf_1234567890",
    "trust_score": 85,
    "verdict": "verified",
    "flags": [],
    "timestamp": "2026-08-01T12:00:00.000Z"
  }
}
```

## Caching & verdict reuse

> Added 2026-08-10, with the deployed implementations above.

`/verifyResponse` memoizes verdicts by **exact content**. Before any LLM call, the
request is reduced to a reuse key:

```
reuse_key = SHA-256( JCS({
  "kind": "text",
  "text_sha256":      SHA-256 of the FULL submitted text (never a prefix),
  "domain":           the request domain (default "General"),
  "model":            the effective model — "openai/gpt-4o-mini", or
                      "byok:<model>" for bring-your-own-key calls,
  "pipeline_version": "2.1.0-hr-guardrails"
}) )
```

`JCS` is RFC 8785 canonical JSON (object keys sorted by UTF-16 code units). All
four components must match for a hit — so a hit is only ever an exact re-run of
the same verification, a BYOK run only ever matches BYOK runs on the same model,
and bumping the pipeline version invalidates the whole cache at once.

Behavior:

- **Hit:** the stored response is replayed verbatim — same `trust_score`,
  `verdict`, `corrections`, `claims`, `warrant_id`, `lineage_id` — plus
  `"cached": true` and `"cache_age_seconds": <seconds since it was stored>`. No
  LLM call runs.
- **TTL: 7 days.** An expired record reads as a miss and the pipeline re-runs.
- **Grounded requests bypass the cache entirely** — when `grounding_doc_ids` is
  present the verdict depends on the documents, which are not part of the key,
  so those runs are neither served from nor written to the cache.
- **Errors are never cached**, and cache failures **fail open**: a broken cache
  read or write falls through to a full pipeline run — the cache can only ever
  save cost, never change a verdict.
- `/webhookVerify` reads the same cache (read-only, non-BYOK entries): a hit
  bills **0** credits, still fires a fresh webhook delivery, and carries
  `cached: true` in the response.

## Latency budgets

> Added 2026-08-10. These are **targets being measured** (MASTER_PLAN v5 §7.1),
> not guarantees — they will be revised against live SLO data.

| Path | Target |
|------|--------|
| Cached verdict hit (`cached: true`) | < 1 s |
| Single tribunal verify | p50 ≈ 15 s · p95 ≈ 40 s |
| PR verification, warm cache | ≤ 3 min p50 |

The measured baseline for a single full tribunal run is **~14 s** — the
`latency_ms: 14255` in this document's own `/verifyResponse` example response is
a live probe, not a mock, and is what the p50 target is calibrated against. The
cache is what bends the curve: identical content re-verified within the TTL
skips the tribunal entirely, and PR verification re-checks only claims whose
content actually changed.

## Trust Score Scale

| Score | Verdict | Meaning |
|-------|---------|---------|
| 80-100 | verified | Claims are well-supported with proper disclaimers |
| 50-79 | contested | Some claims unsupported — corrections issued |
| 0-49 | rejected | Major hallucinations or fabrications detected |

## Tribunal Architecture

```
Input Text
    ↓
[Proposer] → Generates initial answer
    ↓
[Critic] → Adversarially challenges every premise, citation, and logical step
    ↓
[Verifier] → Renders verdict with trust score and specific corrections
    ↓
Cryptographic Warrant (premises, sources, signed hash)
```

## Verdict Values

- **verified** — The response is well-supported. Trust score 80+.
- **contested** — Some claims are unsupported. Corrections provided. Trust score 50-79.
- **rejected** — Major hallucinations detected. Do not use this response. Trust score <50.

## Independent warrant verification (v2)

> Added 2026-08-10, with the deployed implementations above.

Warrants created since the 2026-08-10 deploy are **dual-signed**: the legacy
`signed_hash` (kept byte-for-byte for existing consumers) plus an RFC 8785
canonical **v2** signature that a third party can verify with nothing from
Aether but the published public key.

### The signed payload

The v2 signature covers exactly this JSON object — these six keys, nothing else:

```json
{
  "schema": "aether.warrant.v2",
  "answer_version_id": "<AnswerVersion id — the lineage_id in API responses>",
  "answer_text_sha256": "<lowercase SHA-256 hex of the answer text>",
  "conclusion": "<the warrant's conclusion>",
  "premises": ["<claim>", "..."],
  "sources": ["<url>", "..."]
}
```

- **Canonicalize** per RFC 8785 (JCS): recursive object-key sort in UTF-16
  code-unit order, `JSON.stringify` serialization semantics, no whitespace.
- **`payload_hash_v2`** = lowercase SHA-256 hex over the canonical UTF-8 bytes.
- **`signed_hash_v2`** = Ed25519 signature over the **UTF-8 bytes of the
  `payload_hash_v2` hex string** (not the raw digest bytes), encoded as
  `sf2x_ed25519_` + base64url(signature).
- **`key_id`** = `ed25519:` + the first 16 hex chars of SHA-256 of the public
  key PEM string.
- **No `issued_at`** in the payload — the signature binds content only; time
  attestation comes from the transparency chain below.
- **`answer_text_sha256` hashes the answer text as persisted**, not as
  submitted: the endpoints truncate to 4,000 characters before storing, so hash
  the stored text (`text.slice(0, 4000)`) or recomputation will fail on longer
  inputs.

### Key discovery

> **Corrected 2026-08-10.** Key discovery and signed tree heads previously
> documented standalone `aetherKeys` and `transparencyCheckpoint` functions —
> both were consolidated into `warrantRegistry` ops (`op=keys`,
> `op=checkpoint`, `op=checkpoint_create`) because of the platform's
> 50-function cap; the standalone endpoints never deployed.

- `GET https://aether.sf2x.com/.well-known/aether-keys.json` — a static pointer
  (`schema: "aether.keys.pointer.v1"`) naming the live endpoint.
- `GET|POST https://aether.sf2x.com/api/functions/warrantRegistry?op=keys` (POST
  callers may send `{"op": "keys"}` in the body instead) — the live, signed
  key document (`schema: "aether.keys.v1"`, no auth): `keys[]` with `key_id`,
  `algorithm: "Ed25519"`, `public_key_pem`, and `status`, plus `legacy_schemes`
  and a self-signed `payload_hash`/`signature` over
  `{ schema, keys, legacy_schemes }` using the same JCS + Ed25519 conventions.
  Self-signing proves transport integrity (a tampered document fails
  verification), **not** key authenticity — anchor first-fetch trust in the
  serving domain plus the transparency log; key rotation adds cross-signatures
  from the outgoing key.

### Legacy (v1) signing note

Pre-v2 warrants carry only `signed_hash`, computed over a `|`-joined string
with `;;` sub-joins in four variant forms — delimiter-ambiguous, which is why
the server brute-forces variants to verify them. Legacy **Ed25519** seals remain
publicly verifiable; **`HMAC-SHA256 server-attested`** and **`FNV fingerprint`**
seals are not (publishing the HMAC key would make it forgeable) — the registry
labels those `publicly_verifiable: false`. No historic warrant is orphaned:
legacy verification stays available server-side forever.

### Verification recipe (no Aether code)

1. Collect the six payload fields. `answer_version_id` is the `lineage_id` from
   the API response; `conclusion`, `premises`, and `sources` are the values
   persisted on the warrant; `answer_text_sha256` is stored on the warrant (or
   recomputed from the persisted answer text).
2. Rebuild the payload object with exactly the keys shown above.
3. JCS-canonicalize it and take the lowercase SHA-256 hex — it must equal
   `payload_hash_v2`.
4. Strip the `sf2x_ed25519_` prefix from `signed_hash_v2` and base64url-decode
   the remainder into the raw signature.
5. Verify the Ed25519 signature over the UTF-8 bytes of the hex hash string
   using the `public_key_pem` from key discovery (match on `key_id`).

### The public seal (`public_seal`)

The v2 seal above binds **content** — `conclusion`, `premises`, `sources` — and
the registry deliberately never publishes those (the privacy boundary: the log
is unauthenticated and enumerable). So a stranger cannot rebuild the v2 signed
bytes and cannot check that seal; only the holder of the content can.

The **public seal** closes that gap without moving the boundary. It is an
*additional* Ed25519 signature over a payload made entirely of **published
material — hashes, never content**. Every field of it comes back in the
`verified_warrant` block, so any third party rebuilds the exact signed bytes
from a registry response alone and verifies offline.

```json
{
  "schema": "aether.warrant.public.v1",
  "warrant_id": "<Warrant id>",
  "answer_version_id": "<AnswerVersion id — the lineage_id in API responses>",
  "answer_text_sha256": "<lowercase SHA-256 hex of the answer text as persisted>",
  "conclusion_sha256": "<SHA-256 hex of the conclusion string as persisted>",
  "premises_sha256": "<SHA-256 hex of the JCS canonicalization of the premises array>",
  "sources_sha256": "<SHA-256 hex of the JCS canonicalization of the sources array>",
  "created_date": "<the warrant's created_date, ISO string as stored>"
}
```

- **`public_payload_hash`** = lowercase SHA-256 hex over the RFC 8785 (JCS)
  canonical bytes of that object — the same canonicalization as v2 and the tree
  heads.
- **`public_seal`** = Ed25519 over the **UTF-8 bytes of the
  `public_payload_hash` hex string** (not the raw digest), encoded
  `sf2x_ed25519_` + base64url. Same convention as every other Aether seal.
- **`public_seal_key_id`** — which published key signed it; match it against
  `keys[].key_id` from `?op=keys`.
- **`publicly_sealed`** — `true` when the warrant carries the seal. Warrants
  issued before it existed are `false`: **absent, not failed** — there is no
  seal to check, and no verifier should render that as a failure.
- The three content hashes use the **values as persisted on the warrant row**;
  the two array hashes are taken over the JCS canonicalization of the array
  (`["a","b"]` — no whitespace), not a join.

**Offline verification recipe** — the registry response plus the key document,
nothing else. Runs in any modern browser console or Node 18.4+:

```js
const jcs = (v) => v === null ? 'null'
  : Array.isArray(v) ? '[' + v.map(jcs).join(',') + ']'
  : typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}'
  : JSON.stringify(v);

const r = await (await fetch(FUNCTION_URL + '/warrantRegistry', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ warrant_id: WARRANT_ID, limit: 500 }),
})).json();
const w = r.verified_warrant;
if (!w.publicly_sealed) throw new Error('no public seal on this warrant — absent, not failed');

// 1. Rebuild the payload from the PUBLISHED fields. Exactly these 8 keys.
const payload = {
  schema: 'aether.warrant.public.v1',
  warrant_id: w.warrant_id,
  answer_version_id: w.answer_version_id,
  answer_text_sha256: w.answer_text_sha256,
  conclusion_sha256: w.conclusion_sha256,
  premises_sha256: w.premises_sha256,
  sources_sha256: w.sources_sha256,
  created_date: w.created_date,
};

// 2. Canonicalize (RFC 8785) and hash — this is the message that was signed.
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jcs(payload))))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
console.log('hash matches published:', hash === w.public_payload_hash);

// 3. Verify with the published key (match on key_id).
const doc = await (await fetch(FUNCTION_URL + '/warrantRegistry?op=keys')).json();
const pem = (doc.keys.find(k => k.key_id === w.public_seal_key_id) || doc.keys[0]).public_key_pem;
const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
const key = await crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
const sig = Uint8Array.from(atob(w.public_seal.slice(13).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
console.log('public seal valid:', await crypto.subtle.verify(
  { name: 'Ed25519' }, key, sig, new TextEncoder().encode(hash)));
```

**What it proves, and what it does not.** A valid public seal proves the
published hashes and identifiers are exactly the ones Aether signed, and that
none of them has been altered since — the registry cannot quietly restate a
warrant's content bindings. It does **not** reveal the content, and it does not
let you check the content: to do that you must hold the text and hash it
yourself (`op=eligibility` does exactly this for the answer text, and the same
hash comparison works for the conclusion, premises and sources). The v2 seal
remains the binding over the content itself, and remains verifiable only by
someone who holds it.

The Proof Theater (`/proof`) runs this whole check in the visitor's browser and
shows each step; for `publicly_sealed: false` warrants it says so plainly rather
than rendering an absent seal as a failed one.

### Display eligibility (`op=eligibility`)

`GET|POST /api/functions/warrantRegistry?op=eligibility` (POST callers may put
the fields in the body instead) — the §20 anti-laundering check as a public,
privacy-safe op (no auth). A v2 warrant binds the exact answer text via
`answer_text_sha256`; this op answers **"does the text being displayed still
carry this warrant?"** by hash comparison alone — you never send the content,
only its SHA-256.

**Request** — `content_sha256` (required) plus any one warrant locator:
`warrant_id`, `signed_hash`, or `verification_id`/`lineage_id`:

```
GET /api/functions/warrantRegistry?op=eligibility&warrant_id=<id>&content_sha256=<64 hex chars>
```

**The exact hash recipe** — `content_sha256` = lowercase SHA-256 hex over the
UTF-8 bytes of the answer text **as persisted** — no trimming, no
case-folding, no whitespace normalization:

- `verifyResponse` / `webhookVerify` warrants persist only the **first 4,000
  characters** (`text.slice(0, 4000)`) — hash that slice.
- `inquire` / `warrantApi` / tribunal warrants persist the **full** answer
  text (max 20,000 chars) — hash it whole.

Uppercase hex is normalized server-side; anything that is not a 64-hex-char
digest is a `400`.

**Response** (integrity metadata only — never warrant content):

```json
{
  "eligible": false,
  "reasons": ["content hash does not match the warranted text"],
  "checked": {
    "content_hash_match": false,
    "status_active": true,
    "not_expired": true,
    "v2_bound": true
  },
  "warrant_id": "6a6de04b26cf84c8aa37847f",
  "warrant_status": "valid",
  "expires_at": "2026-09-10T12:00:00.000Z",
  "hash_recipe": "content_sha256 = lowercase SHA-256 hex over the UTF-8 bytes of the answer text AS PERSISTED..."
}
```

**Fail-closed semantics** — `eligible` is true only when **all four** checks
pass:

- `content_hash_match` — strict equality against the warrant's
  `answer_text_sha256`.
- `status_active` — only `validity_status: "valid"` passes; `weak`, `invalid`,
  `insufficient_evidence`, `contested`, and `expired` all fail.
- `not_expired` — `expiry_date` must be present, parseable, and in the future.
- `v2_bound` — a pre-v2 warrant with no `answer_text_sha256` is **never**
  eligible (`"no content binding (pre-v2 warrant)"`): there is nothing to
  match the displayed text against.

An unknown warrant answers `404 { "eligible": false, "reasons": ["warrant not
found"] }`. The embed script (`embed.js`) uses this op automatically when the
script tag carries `data-content-sha256` (or `data-content`, hashed locally
with WebCrypto): an eligible warrant renders the normal badge; anything else
renders a grey struck-out "verification no longer matches this content" state
— never the green badge.

### Inclusion proofs (RFC 6962)

`POST /api/functions/warrantApi` issues warrants;
`POST /api/functions/warrantRegistry` is the public, read-only transparency log
(no auth — it returns **integrity metadata only, never warrant content**). Look
up a warrant by `warrant_id`, `verification_id`, `lineage_id`, or `signed_hash`
and the `verified_warrant` block includes:

```json
"inclusion_proof": {
  "leaf_hash": "<lowercase hex>",
  "index": 42,
  "tree_size": 100,
  "siblings": ["<lowercase hex>", "..."],
  "algorithm": "RFC6962-SHA256"
}
```

- **Leaves** are the listing window's warrants ordered by `created_date`
  ascending with `id` as tie-break; each leaf string is the warrant's
  `signed_hash` (its `id` when unsigned).
- **Hashing** follows RFC 6962 §2.1: leaf hash = SHA-256(`0x00` ‖ leaf UTF-8
  bytes) · interior node = SHA-256(`0x01` ‖ left ‖ right) · unbalanced trees
  split at the largest power of two **less than** n (never by duplicating the
  last leaf).
- **To verify:** recompute leaf → root from `siblings` (ordered leaf → root)
  and compare against the response's `merkle_root`. Nothing but SHA-256 is
  required.
- A warrant outside the current listing window gets `inclusion_proof: null` —
  never a proof against a root it is not actually in. The response also carries
  the legacy linear `root` (SHA-256 of the `|`-joined leaves), kept for
  existing consumers.

### Signed tree heads (transparency checkpoints)

`GET|POST /api/functions/warrantRegistry?op=checkpoint` (or POST body
`{"op": "checkpoint"}`) publishes durable, append-only
**signed tree heads over the full warrant log** (the registry's `merkle_root`
covers only the newest ≤500 warrants). Reads need no auth and return the latest
head plus the last 10 (`{ registry, schema, head, recent_heads, note }`);
creating a new checkpoint is admin-only (POST with `op=checkpoint_create`).
Each head:

```json
{
  "head_id": "<TreeHead id>",
  "created_date": "<ISO timestamp>",
  "schema_version": "aether.treehead.v1",
  "tree_size": 1200,
  "merkle_root": "<lowercase hex>",
  "prev_root": "<previous head's merkle_root, null on the genesis head>",
  "payload_hash": "<lowercase hex>",
  "signed_head": "sf2x_ed25519_...",
  "key_id": "ed25519:..."
}
```

- **Signing payload** — exactly
  `{ "schema": "aether.treehead.v1", "tree_size": <n>, "merkle_root": "<hex>", "prev_root": "<hex>|null" }`,
  canonicalized per RFC 8785; `payload_hash` = lowercase SHA-256 hex of the
  canonical bytes; `signed_head` = Ed25519 over the UTF-8 bytes of that hex
  string (`sf2x_ed25519_` + base64url) — the same conventions as warrant v2,
  verified with the key-discovery `public_key_pem` (match on `key_id`).
  `prev_root` is inside the payload, so the chain link is signed.
- **Leaves** — the full log ordered by `created_date` ascending with `id`
  tie-break; leaf string = `signed_hash` (`id` when unsigned); root per
  RFC 6962 as above. Same rules as the registry, so a head is independently
  recomputable by paging the `warrantRegistry` chain — or verify a single
  warrant against a head via its inclusion proof (trust-on-inclusion) when the
  registry window matches the head's `tree_size`/`merkle_root`.
- If the log is unchanged since the latest head, POST returns
  `{ unchanged: true, head }` and creates nothing; heads are never updated or
  deleted, and a checkpoint over a partial log scan fails closed (503) instead
  of publishing.
- **Append-only growth is provable** — `prev_root` only records the *claim*
  that one head follows another. `op=consistency` (below) issues the RFC 6962
  proof that makes the claim checkable.

### Consistency proofs (RFC 6962 §2.1.2)

`GET|POST /api/functions/warrantRegistry?op=consistency` (or POST body
`{"op": "consistency", "from_tree_size": 500, "to_tree_size": 1200}`) — public,
no auth.

**Why this matters.** An inclusion proof proves a warrant sits under *some*
root. It says nothing about whether that root was reached honestly: a log that
rewrote history between two checkpoints can still hand out perfectly valid
inclusion proofs against its new, forked root. A consistency proof closes that
hole — it proves the size-*n* tree is an **append** of the size-*m* tree, i.e.
that all *m* earlier leaves are byte-identical and in the same order. Chain it
across every published head and the log is *provably* append-only.

Omit both sizes and the two newest heads are used. Response:

```json
{
  "registry": "sf2x_warrants",
  "schema": "aether.treehead.v1",
  "from": {
    "tree_size": 500,
    "root": "<lowercase hex>",
    "signed_head": "sf2x_ed25519_...",
    "key_id": "ed25519:...",
    "head_id": "<TreeHead id>",
    "created_date": "<ISO timestamp>",
    "prev_root": "<hex>|null",
    "schema_version": "aether.treehead.v1",
    "payload_hash": "<lowercase hex>",
    "signing_payload": { "schema": "aether.treehead.v1", "tree_size": 500, "merkle_root": "<hex>", "prev_root": "<hex>|null" }
  },
  "to": { "…same shape at the later size…" },
  "proof": ["<lowercase hex>", "…"],
  "algorithm": "RFC6962-SHA256",
  "leaf_rule": "…",
  "log": { "live_tree_size": 1200, "pages_scanned": 3 },
  "verification_note": "…"
}
```

**Offline verification recipe.** The response is self-contained: everything
needed is in it, plus the published key document (`?op=keys`, or any pinned
copy). No further call to us.

1. **Both signatures.** For each of `from` / `to`: canonicalize
   `signing_payload` per RFC 8785 (JCS), take the lowercase SHA-256 hex of
   those bytes, and check it equals `payload_hash`. Then strip the
   `sf2x_ed25519_` prefix from `signed_head`, base64url-decode, and verify it
   as an Ed25519 signature over the **UTF-8 bytes of that hex string**, using
   the public key whose `key_id` matches.
2. **The consistency fold** (RFC 9162 §2.1.4.2) with `first = from.tree_size`,
   `first_hash = from.root`, `second = to.tree_size`, `second_hash = to.root`:
   - If `first` is an exact power of two, **prepend `first_hash`** to the node
     list (the generator omits it — `D[0:m]` is a complete subtree there).
   - Set `fn = first - 1`, `sn = second - 1`; while `LSB(fn)` is set,
     right-shift both equally.
   - Set `fr` and `sr` to the first node. For each subsequent node `c`: if
     `sn == 0`, fail. If `LSB(fn)` is set **or** `fn == sn`, set
     `fr = H(0x01 ‖ c ‖ fr)` and `sr = H(0x01 ‖ c ‖ sr)`, then — if `LSB(fn)`
     is not set — right-shift both until `LSB(fn)` is set or `fn == 0`.
     Otherwise set `sr = H(0x01 ‖ sr ‖ c)`. Finally right-shift both once.
   - Accept only if `fr == first_hash`, `sr == second_hash`, **and** `sn == 0`.
   - Hashing is RFC 6962 §2.1: leaf = SHA-256(`0x00` ‖ leaf bytes), interior =
     SHA-256(`0x01` ‖ left ‖ right).
3. **Conclusion.** Two valid signatures plus a fold that reproduces both roots
   proves the size-`to` tree is an append of the size-`from` tree. It proves
   nothing about leaves added *after* `to.tree_size` — check the next head pair
   for that.

Scope and failure modes, stated plainly:

- `from_tree_size === to_tree_size` is the degenerate case: `proof` is the
  **empty array** and the two heads must simply carry the same root.
- **Fail-closed, always.** A truncated full-log scan is `503` (a proof over a
  partial view of the log would be a falsehood with a signature attached). A
  live log that no longer reproduces a published head is `409` **tamper
  evidence** — the mismatch is returned, never a proof between roots we
  invented. Two published heads at the same `tree_size` with different roots is
  `409` **fork evidence**. An unknown size is `404` with
  `available_tree_sizes`. Nothing here ever fabricates a path.
- Leaves and ordering are identical to the checkpoint rule above, so the whole
  chain is reproducible from the public listing.
- Conformance: `app/base44/shared/tests/merkle.consistency.test.mjs` is
  exhaustive over every `(m, n)` pair for tree sizes 1–33 (561 proofs), with
  roots cross-checked against a second, independently written MTH, and 11,553
  tamper cases (byte flips, truncation, extension, forged roots, cross-pair
  reuse) all rejected.

## Rate Limits

| Tier | Requests/min | Requests/month |
|------|--------------|----------------|
| Free | 10 | 100 |
| Starter | 60 | 5,000 |
| Pro | 200 | 25,000 |
| Enterprise | Unlimited | Unlimited |

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing required fields |
| 401 | Unauthorized — invalid or missing API key |
| 429 | Rate limit exceeded |
| 500 | Internal tribunal error |

## SDK Examples

### JavaScript/Node.js
```javascript
const response = await fetch(
  "https://aether.sf2x.com/api/functions/verifyResponse",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ text: "Your text here" })
  }
);
const result = await response.json();
console.log(`Trust score: ${result.trust_score}/100 — ${result.verdict}`);
```

### Python
```python
import requests

response = requests.post(
    "https://aether.sf2x.com/api/functions/verifyResponse",
    json={"text": "Your text here"},
    headers={"Content-Type": "application/json", "x-api-key": API_KEY}
)
result = response.json()
print(f"Trust score: {result['trust_score']}/100 — {result['verdict']}")
```

### cURL
```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AETHER_API_KEY" \
  -d '{"text": "Your text here"}'
```

## Webhook Integration

Register a webhook URL to receive verification results asynchronously:

```javascript
// Your webhook endpoint
app.post("/webhook/aether", (req, res) => {
  const event = req.headers["x-aether-event"];
  const result = req.body.data;
  
  if (event === "verification.complete") {
    console.log(`Verification ${result.verification_id}: ${result.trust_score}/100 (${result.verdict})`);
    
    if (result.verdict === "contested" || result.verdict === "rejected") {
      // Handle flagged content
      console.log("Corrections:", result.flags);
    }
  }
  
  res.status(200).send("OK");
});
```

## Chrome Extension

Download the Aether Chrome extension to add one-click verification to:
- ChatGPT (chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Microsoft Copilot (copilot.microsoft.com)
- Perplexity (perplexity.ai)

The extension injects a "Verify with Aether" button next to AI responses. Click it to run the tribunal and see the trust score inline.

## Support

- API Docs: https://aether.sf2x.com/api-docs
- Benchmark: https://aether.sf2x.com/benchmark
- Playground: https://aether.sf2x.com/playground
- Email: cam@sf2x.com
