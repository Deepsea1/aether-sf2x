/**
 * Aether — The Truth Layer for AI · TypeScript SDK
 *
 *   npm install  (no deps; uses fetch)
 *   import { Aether } from "./aether";
 *   const a = new Aether("sk_sf2x_...", "https://your-app.base44.app");
 *   const v = await a.verify("Vitamin C prevents the common cold.", "Medicine");
 *   console.log(v.trust_score, v.verdict, v.corrections);
 */

export interface VerifyResult {
  trust_score: number;
  verdict: "verified" | "contested" | "rejected";
  corrections: string[];
  claims: { claim: string; supported: boolean; notes?: string }[];
  warrant_id: string;
  tribunal_url: string;
  lineage_id: string;
  latency_ms: number;
}

export class Aether {
  constructor(private apiKey: string, private origin = "https://your-app.base44.app") {}

  private headers(): Record<string, string> {
    return { "x-api-key": this.apiKey, "Content-Type": "application/json" };
  }

  async verify(text: string, domain = "General", source = "ts-sdk", groundingDocIds?: string[]): Promise<VerifyResult> {
    const body: any = { text, domain, source };
    if (groundingDocIds) body.grounding_doc_ids = groundingDocIds;
    const r = await fetch(`${this.origin}/functions/verifyResponse`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  async *verifyStream(text: string, domain = "General", source = "ts-sdk"): AsyncGenerator<any> {
    const r = await fetch(`${this.origin}/functions/streamVerify`, { method: "POST", headers: this.headers(), body: JSON.stringify({ text, domain, source }) });
    if (!r.ok || !r.body) throw new Error("stream failed");
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const p of parts) {
        const line = p.trim();
        if (line.startsWith("data: ")) yield JSON.parse(line.slice(6));
      }
    }
  }

  async tribunal(prompt: string, domain = "General", stakes: "low" | "medium" | "high" | "critical" = "medium"): Promise<any> {
    const r = await fetch(`${this.origin}/functions/inquireTribunal`, { method: "POST", headers: this.headers(), body: JSON.stringify({ prompt, domain, stakes }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  async batch(items: { text: string; domain?: string }[]): Promise<any> {
    const r = await fetch(`${this.origin}/functions/verifyBatch`, { method: "POST", headers: this.headers(), body: JSON.stringify({ items: items.slice(0, 10) }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  async benchmark(): Promise<any> {
    const r = await fetch(`${this.origin}/entities/BenchResult?sort=-bench_score&limit=20`);
    return r.json();
  }
}
