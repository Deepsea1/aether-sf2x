// Extraction-recall gold corpus v1 (MASTER_PLAN v5 §6.3).
//
// Each case is a realistic artifact excerpt plus the material claims a careful
// reviewer would mark — the claims that, if wrong, would mislead a reader or
// justify a decision. Non-material sentences (opinion, intent, questions,
// hedged musing) are deliberately present in the text and deliberately ABSENT
// from gold: if the extractor grabs them too that costs precision, not recall,
// and this corpus measures recall.
//
// HONESTY NOTE — this corpus is built to expose the shipped extractor, not to
// flatter it. §6.3 names compound, implicit, and cross-sentence claims as the
// deterministic path's explicit weak spots, so they are represented here in
// proportion to how often they occur in real docs and PRs, not minimised. A
// corpus of nothing but simple declarative sentences would produce a high
// number that means nothing, and that number would gate whether Aether may
// hard-block a customer's build.
//
// Sources are paraphrased/synthesised in the style of the technical-docs wedge
// (READMEs, API docs, release notes, PR descriptions, security pages).

export const EXTRACTION_GOLD_VERSION = 'extraction-gold-v1';

export const EXTRACTION_GOLD_V1 = [
  // ——— simple declaratives: the extractor's home ground ———
  {
    id: 'G01',
    kind: 'simple',
    text: 'The gateway reduces p95 latency by 40% compared with the previous release. Deployment takes about ten minutes.',
    gold_claims: [
      'The gateway reduces p95 latency by 40% compared with the previous release',
    ],
    notes: 'Second sentence is operational colour, not a material claim.',
  },
  {
    id: 'G02',
    kind: 'simple',
    text: 'All customer data is encrypted at rest using AES-256. We are proud of our security posture.',
    gold_claims: ['All customer data is encrypted at rest using AES-256'],
    notes: 'Second sentence is sentiment, correctly not gold.',
  },
  {
    id: 'G03',
    kind: 'simple',
    text: 'The service achieved SOC 2 Type II certification in March 2025. Our auditors were thorough.',
    gold_claims: ['The service achieved SOC 2 Type II certification in March 2025'],
  },

  // ——— compound: two material claims sharing one sentence (§6.3 target) ———
  {
    id: 'G04',
    kind: 'compound',
    text: 'The platform is HIPAA compliant and processes over two million transactions per day.',
    gold_claims: [
      'The platform is HIPAA compliant',
      'The platform processes over two million transactions per day',
    ],
    notes: 'Compound: one sentence, two independently falsifiable claims.',
  },
  {
    id: 'G05',
    kind: 'compound',
    text: 'Our model scored 92% on the internal benchmark, while inference costs fell by half.',
    gold_claims: [
      'Our model scored 92% on the internal benchmark',
      'inference costs fell by half',
    ],
  },
  {
    id: 'G06',
    kind: 'compound',
    text: 'The SDK supports Python 3.9 and above, requires no external dependencies, and ships under the MIT licence.',
    gold_claims: [
      'The SDK supports Python 3.9 and above',
      'The SDK requires no external dependencies',
      'The SDK ships under the MIT licence',
    ],
    notes: 'Three claims in one sentence — a single verdict would cover all three.',
  },

  // ——— cross-sentence: the claim only exists across a boundary (§6.3 target) ———
  {
    id: 'G07',
    kind: 'cross_sentence',
    text: 'We benchmarked the new indexer against the old one. It was four times faster on the same hardware.',
    gold_claims: ['the new indexer was four times faster than the old one on the same hardware'],
    notes: 'Pronoun "It" carries the subject across the boundary.',
  },
  {
    id: 'G08',
    kind: 'cross_sentence',
    text: 'Consider the retention policy. Records are deleted after ninety days.',
    gold_claims: ['Records under the retention policy are deleted after ninety days'],
  },

  // ——— implicit: material assertion without a factual-indicator keyword ———
  {
    id: 'G09',
    kind: 'implicit',
    text: 'Rate limiting kicks in at one thousand requests per minute per API key.',
    gold_claims: ['Rate limiting begins at one thousand requests per minute per API key'],
    notes: 'No copula, no percentage — informal phrasing of a hard limit.',
  },
  {
    id: 'G10',
    kind: 'implicit',
    text: 'Upgrading from v1 to v2 drops support for the legacy webhook signature.',
    gold_claims: ['Upgrading from v1 to v2 drops support for the legacy webhook signature'],
    notes: 'A breaking-change claim phrased as a plain statement of behaviour.',
  },

  // ——— quantitative / scope-bearing, the kind semantic diff cares about ———
  {
    id: 'G11',
    kind: 'scoped',
    text: 'Under the tested configuration, energy use fell by 10%. Results outside that configuration were not measured.',
    gold_claims: [
      'Under the tested configuration, energy use fell by 10%',
      'Results outside the tested configuration were not measured',
    ],
    notes: 'The qualification is itself material — dropping it is the §20 scope-laundering case.',
  },
  {
    id: 'G12',
    kind: 'scoped',
    text: 'The free tier includes one hundred verifications per month. Overages are billed at two cents each.',
    gold_claims: [
      'The free tier includes one hundred verifications per month',
      'Overages are billed at two cents each',
    ],
  },

  // ——— negative / absence claims ———
  {
    id: 'G13',
    kind: 'negative',
    text: 'We never train on customer data. Support responds within one business day.',
    gold_claims: [
      'We never train on customer data',
      'Support responds within one business day',
    ],
  },

  // ——— short but material: below the extractor's length filter ———
  {
    id: 'G14',
    kind: 'short',
    text: 'Uptime was 99.99%. The team shipped the dashboard redesign the same week.',
    gold_claims: ['Uptime was 99.99%'],
    notes: 'Material claim in a very short sentence — the length filter is the risk here.',
  },

  // ——— non-material distractors only: gold is a single real claim ———
  {
    id: 'G15',
    kind: 'distractor',
    text: 'Should we revisit the caching strategy? It might be worth exploring. The current cache hit rate is 87%.',
    gold_claims: ['The current cache hit rate is 87%'],
    notes: 'Question and speculation are correctly not gold.',
  },
];
