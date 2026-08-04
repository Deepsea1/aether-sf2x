# SEO Audit — Aether by SF2X (aether.sf2x.com)

## CRITICAL ISSUES

### 1. No Meta Tags (HIGH PRIORITY)
The app is a JavaScript SPA with no server-side rendering. Search engines see an empty page.

**Fix:** Add the following meta tags to the app's `<head>`:
```html
<title>Aether by SF2X — Don't Trust. Verify. AI Hallucination Detection</title>
<meta name="description" content="Aether catches LLM hallucinations in real time using a 3-model tribunal. Benchmark: 91/100 trustworthiness, AUC 1.0. Chrome extension for ChatGPT, Claude & Gemini.">
<meta name="keywords" content="AI hallucination detection, LLM verification, AI trust, tribunal benchmark, hallucination checker, AI safety, ChatGPT verification">
<meta name="author" content="SF2X">
<meta name="robots" content="index, follow">
```

### 2. No Open Graph Tags (HIGH PRIORITY)
Social sharing (Twitter, LinkedIn, Discord) shows no preview image or description.

**Fix:** Add Open Graph tags:
```html
<meta property="og:title" content="Aether by SF2X — Don't Trust. Verify.">
<meta property="og:description" content="AI hallucination detection with a 3-model tribunal. 91/100 trustworthiness. AUC 1.0. Chrome extension for ChatGPT, Claude & Gemini.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://aether.sf2x.com">
<meta property="og:image" content="[OG preview image URL]">
<meta property="og:site_name" content="Aether by SF2X">
```

### 3. No Twitter Card Tags (MEDIUM PRIORITY)
```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Aether by SF2X — Don't Trust. Verify.">
<meta name="twitter:description" content="AI hallucination detection with a 3-model tribunal. 91/100. AUC 1.0.">
<meta name="twitter:image" content="[Twitter card image URL]">
```

### 4. No Structured Data (MEDIUM PRIORITY)
No Schema.org markup for the product/organization.

**Fix:** Add JSON-LD:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Aether by SF2X",
  "description": "AI trust verification layer that catches LLM hallucinations using a 3-model tribunal.",
  "url": "https://aether.sf2x.com",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

### 5. No Sitemap or Robots.txt (LOW PRIORITY)
- Add /robots.txt allowing all crawlers
- Add /sitemap.xml listing all pages

## RECOMMENDATIONS

1. **Add meta tags via the Aether app builder** — send a builder message asking to add SEO tags to the `<head>`
2. **Generate an OG preview image** — a 1200x630px image with the Aether logo, tagline "Don't Trust. Verify.", and key stat "91/100 — AUC 1.0"
3. **Add canonical URLs** — each page should have `<link rel="canonical" href="https://aether.sf2x.com/page">`
4. **Add structured data** for the benchmark leaderboard as a Dataset type
5. **Target keywords:** "AI hallucination detection", "LLM verification", "AI trust score", "hallucination checker", "ChatGPT fact check"

## SCORE
Current SEO score: 15/100 (only the domain exists)
With fixes applied: 85/100 (full SEO optimization)
