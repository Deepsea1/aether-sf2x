import React, { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { Shield, TrendingDown, TrendingUp, Zap, DollarSign, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Credit costs per InvokeLLM call. Documented by Base44: automatic, gemini_3_flash, gpt_5_4.
// Others are tier-based estimates (clearly marked). 1 credit ≈ $0.01 (adjustable assumption).
const MODELS = [
  { model: "gpt_5_mini", credits: 2, family: "OpenAI mini", documented: false },
  { model: "automatic", credits: 3, family: "Base44 default", documented: true },
  { model: "gemini_3_flash", credits: 5, family: "Google", documented: true },
  { model: "gemini_3_1_pro", credits: 8, family: "Google Pro", documented: false },
  { model: "claude_sonnet_4_6", credits: 8, family: "Anthropic Sonnet", documented: false },
  { model: "gpt_5_6_sol", credits: 10, family: "OpenAI", documented: false },
  { model: "claude-sonnet-5", credits: 10, family: "Anthropic", documented: false },
  { model: "gpt_5_4", credits: 15, family: "OpenAI GPT-5", documented: true },
  { model: "claude_opus_4_6", credits: 18, family: "Anthropic Opus", documented: false },
  { model: "claude_opus_4_7", credits: 20, family: "Anthropic Opus", documented: false },
  { model: "claude_opus_4_8", credits: 25, family: "Anthropic Opus", documented: false },
];

// Pricing tiers. Quotas for Starter (2,000) and Pro (25,000) are from the inquire() quota logic.
// Others are illustrative assumptions — adjust the calls field to model your real tiers.
const TIERS = [
  { name: "Free", price: 0, calls: 0, note: "Widget only, unmetered" },
  { name: "Starter", price: 5, calls: 2000, note: "Known quota" },
  { name: "API Access", price: 49, calls: 5000, note: "Est. quota" },
  { name: "Premium Insights", price: 99, calls: 10000, note: "Est. quota" },
  { name: "Pro", price: 30, calls: 25000, note: "Known quota" },
  { name: "Pro (annual)", price: 399, calls: 250000, note: "Est. quota" },
  { name: "Enterprise", price: 1999, calls: 100000, note: "Est. quota" },
  { name: "Scale", price: 9999, calls: 500000, note: "Est. quota" },
];

const CHART_GREEN = "#10b981";
const CHART_RED = "#ef4444";
const CHART_AMBER = "#f59e0b";

function fmt(n) {
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

export default function CostAnalysis() {
  const [perCallCredits, setPerCallCredits] = useState(5); // verify + red-team, automatic
  const [dollarPerCredit, setDollarPerCredit] = useState(0.01);

  const tierData = useMemo(() => {
    return TIERS.map((t) => {
      const creditsBurned = t.calls * perCallCredits;
      const platformCost = creditsBurned * dollarPerCredit;
      const profit = t.price - platformCost;
      return { ...t, creditsBurned, platformCost, profit };
    });
  }, [perCallCredits, dollarPerCredit]);

  const modelData = useMemo(() => [...MODELS].sort((a, b) => a.credits - b.credits), []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-500">
            <Shield className="w-6 h-6" />
            <span className="text-sm font-medium uppercase tracking-wide">Aether Economics</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Cost &amp; Profit Analysis</h1>
          <p className="text-muted-foreground max-w-2xl">
            Every verification burns Base44 integration credits via <code className="text-foreground">InvokeLLM</code>.
            Running red-team on every answer doubled per-call cost. This shows exactly where credits go and which
            pricing tiers stay profitable if a user maxes their quota.
          </p>
        </div>

        {/* Assumption controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" /> Assumptions</CardTitle>
            <CardDescription>
              Adjust to model different scenarios. Base44 only publishes credit costs for 3 models; the rest are estimates.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="percall">Credits per API call</Label>
              <Input id="percall" type="number" min={1} max={50} value={perCallCredits}
                onChange={(e) => setPerCallCredits(Math.max(1, Number(e.target.value) || 1))} />
              <p className="text-xs text-muted-foreground">
                Default 5 = verify (gpt_5_mini, ~2) + red-team (automatic, ~3). Set to 3 for verify-only, 30 for a full tribunal.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpc">Dollars per credit</Label>
              <Input id="dpc" type="number" min={0} step={0.005} value={dollarPerCredit}
                onChange={(e) => setDollarPerCredit(Math.max(0, Number(e.target.value) || 0))} />
              <p className="text-xs text-muted-foreground">
                Illustrative conversion. On Elite (flat monthly), marginal cost is $0 until you exceed your credit pool — then top-ups apply.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Model cost ranking */}
        <Card>
          <CardHeader>
            <CardTitle>Model Cost Ranking (cheapest → most expensive)</CardTitle>
            <CardDescription>
              Integration credits consumed per <code>InvokeLLM</code> call. Green = documented by Base44; amber = estimated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={modelData} layout="vertical" margin={{ left: 40, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" dataKey="credits" name="Credits" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="model" width={130} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [v + " credits/call", "Cost"]}
                  labelFormatter={(label) => {
                    const m = modelData.find((x) => x.model === label);
                    return `${label} (${m?.family})${m?.documented ? " — documented" : " — estimated"}`;
                  }}
                />
                <Bar dataKey="credits" radius={[0, 4, 4, 0]}>
                  {modelData.map((m) => (
                    <Cell key={m.model} fill={m.documented ? CHART_GREEN : CHART_AMBER} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Documented cost</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Estimated</span>
            </div>
          </CardContent>
        </Card>

        {/* Tier profitability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Pricing Tier Profitability (if user maxes quota)
            </CardTitle>
            <CardDescription>
              Revenue vs. estimated platform credit cost at {perCallCredits} credits/call × ${dollarPerCredit.toFixed(3)}/credit.
              Negative profit = you lose money if a user maxes the tier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={tierData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [fmt(v), name === "profit" ? "Profit" : name === "platformCost" ? "Platform cost" : name]}
                />
                <ReferenceLine y={0} stroke="white" strokeWidth={1.5} />
                <Bar dataKey="platformCost" name="platformCost" fill={CHART_RED} radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="profit" radius={[4, 4, 0, 0]}>
                  {tierData.map((t, i) => (
                    <Cell key={i} fill={t.profit >= 0 ? CHART_GREEN : CHART_AMBER} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Platform credit cost</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Profit</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Loss</span>
            </div>
          </CardContent>
        </Card>

        {/* Tier detail table */}
        <Card>
          <CardHeader>
            <CardTitle>Tier Breakdown</CardTitle>
            <CardDescription>Per-tier numbers at current assumptions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Tier</th>
                    <th className="py-2 pr-4 text-right">Price/mo</th>
                    <th className="py-2 pr-4 text-right">Calls (quota)</th>
                    <th className="py-2 pr-4 text-right">Credits burned</th>
                    <th className="py-2 pr-4 text-right">Platform cost</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {tierData.map((t) => (
                    <tr key={t.name} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.note}</div>
                      </td>
                      <td className="py-2 pr-4 text-right">{fmt(t.price)}</td>
                      <td className="py-2 pr-4 text-right">{t.calls.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{t.creditsBurned.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right text-red-500">{fmt(t.platformCost)}</td>
                      <td className={`py-2 pr-4 text-right font-semibold ${t.profit >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
                        {fmt(t.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Insight callout */}
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm space-y-2">
              <p className="font-medium text-amber-600 dark:text-amber-400">The viral-spike risk in one number</p>
              <p className="text-muted-foreground">
                At {perCallCredits} credits/call, a single user maxing the <strong>Pro</strong> tier (25,000 calls) burns{" "}
                <strong>{(25000 * perCallCredits).toLocaleString()} credits</strong> — that's {fmt(25000 * perCallCredits * dollarPerCredit)} of platform cost
                against ${fmt(30)} of revenue. The red-team-on-everything change doubled this. BYOK (user's own key) makes that cost $0,
                and the circuit breaker keeps the app alive instead of hard-erroring when the pool empties.
              </p>
              <div className="flex gap-4 pt-1">
                <span className="flex items-center gap-1 text-xs"><TrendingDown className="w-3 h-3 text-red-500" /> Red = platform cost</span>
                <span className="flex items-center gap-1 text-xs"><TrendingUp className="w-3 h-3 text-emerald-500" /> Green = profit</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}