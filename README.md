# 🛡️ Aether by SF2X

**Don't trust. Verify.**

Aether is an AI trust verification layer that catches LLM hallucinations in real time using a 3-model tribunal architecture. It turns unverified AI outputs into audit-ready, cryptographically warranted answers.

## 📊 Benchmark Results

All numbers are Aether's own internal suites, run through the live pipeline and published —
regardless of outcome — on the in-app [methodology page](https://aether.sf2x.com/methodology).
They are vendor-run measurements on small, versioned suites, not independent audits.

| Suite | n | Measures | Latest published result |
|---|---|---|---|
| Correlation audit | 24 (12 true / 12 hallucinated) | Does the trust score separate true from hallucinated claims? | AUC 1.0 · Pearson r=0.98 on this suite — a strong internal signal at this n, not proof of perfect separation in general |
| Negative controls | 30 (+5 thin-coverage probes) | Fabricated-claim catch rate, true-claim pass rate, honest abstention | Gates every release; runs published live |
| Tribunal lift | 6 hard adversarial questions | Single model vs. full tribunal | Per-item table published |

**Withdrawn claims.** Earlier versions of this README compared Aether (91/100) against
"Plain LLM 14/100, Vanilla RAG 28/100, RAG + Output Validation 51/100" with derived
"hallucination rates," and cited a "91 with red-team / 58 without" ablation. Those baselines
were never evaluated by any code in this repository, so they are withdrawn until they can be
re-measured and published with n and methodology attached. Live, always-current results:
[aether.sf2x.com/benchmark](https://aether.sf2x.com/benchmark).

## 🏗️ How It Works

```
Input Text → [Proposer] → [Critic] → [Verifier] → Cryptographic Warrant
```

The **red-team loop** is architectural — the tribunal is adversarial by design. (The previously
cited 91-vs-58 ablation is among the withdrawn claims above.)

Two paths run that shape, and they are not the same depth — worth knowing which one you are calling:

- **Fast path** (`/verifyResponse`, the widget, the extension, the Action) — one model plays
  proposer, critic and verifier in a single pass, ~2-4s. Cheap and quick; not three models.
- **Full tribunal** (the playground and escalation path) — mid-tier proposers from three
  independent labs each reconcile with their own critic, then a cross-firm top-tier model
  verifies and tries to falsify the result. Asymmetric routing: the answer is written by a
  cheaper model, every catch is made by the best one.

## 🔐 Verify it yourself

Warrants are published to an append-only transparency log you can audit without trusting us:
signed tree heads, RFC 6962 inclusion and consistency proofs, and a published signing-key
document (`warrantRegistry?op=keys`). The registry publishes integrity metadata and hashes —
never answer content. See [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).

## 🔌 API Quick Start

`/verifyResponse` answers without a key, capped at 5 verifications/day per IP. Every other
endpoint requires an `x-api-key` header and is metered against your plan's monthly credits.

```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -d '{"text": "According to Section 4.1, all employees get 15 vacation days."}'
```

## 🔧 GitHub Action

**Advisory by default.** v2 reports findings and exits 0; it gates on per-claim dispositions,
not a single score. Set `mode: enforcing` to fail the build. (`threshold` is deprecated —
consulted only against older servers that return no dispositions.) Source and full input
reference: [`github-action/`](github-action/README.md).

```yaml
- uses: sf2x/aether-hallucination-guard@v2
  with:
    api-key: ${{ secrets.AETHER_API_KEY }}
    text: prompts/output.txt
    # mode defaults to 'advisory' — reports, never fails the build
```

## 📁 Structure

- `app/` — the Aether web app + Base44 backend functions (the product itself)
- `github-action/` — CI/CD hallucination guard
- `sdk/` — Python + JavaScript SDKs
- `mcp-worker/` — MCP server, so agents can call Aether as a tool
- `claude-skill/` — Claude skill package
- `chrome-extension/` — Browser extension
- `desktop-extension/` — Desktop extension bridge
- `docs/` — API reference + integration guides
- `docs-site/` — Static docs landing page
- `marketing/` — Launch materials

## 💰 Pricing

Metered in **credits**, not raw calls: a verification costs 2 credits, a warrant 5, a full
inquiry 10, and gate checks are free. Monthly allowances (enforced by `PLAN_QUOTAS` in
`app/base44/shared/apiAuth.js`):

| Plan | Price/mo | Credits/mo |
|---|---|---|
| Free | $0 | 5 verifications/day without sign-in · 100 credits on a free API key |
| Starter | $20 | 250 |
| Pro | $100 | 1,000 |
| Enterprise | $1,999 | 15,000 |
| Enterprise BYOK | $999 | ~200,000 fair-use (you bring your own provider key) |
| Scale | $9,999 | 150,000 |
| API Starter | $49 | 10,000 (~5,000 verifications) |
| API Pro | $199 | 50,000 (~25,000 verifications) |

No tier is unlimited. Running out returns `429` rather than billing an overage.

## 🔗 Links

- Live App: https://aether.sf2x.com
- Full API Docs: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Integration Guide: [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md)
- GitHub Action: [`github-action/README.md`](github-action/README.md)

## 👤 Author

**Cameron Piper** — [@Deepsea1](https://github.com/Deepsea1)

---

*Don't trust. Verify.*
