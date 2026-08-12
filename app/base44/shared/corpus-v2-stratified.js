// Risk-stratified negative-control corpus v2 (MASTER_PLAN v5 §18.2 / §19).
//
// WHY THIS EXISTS. The capability card publishes false-pass and false-block
// rates PER RISK TIER, and §18.2 gates enforcement on the high (≤0.10) and
// critical (≤0.05) tiers. Corpus v1 carried no tier labels at all, so a single
// aggregate was stamped into all four slots — and v1's TRUE claims are entirely
// general knowledge (boiling point, the Titanic, chromosome count). The
// published `critical: 0.10` was therefore not an unstratified measurement of
// critical claims; it was a measurement of a population containing ZERO
// critical claims. A threshold judged on the wrong population is decoration.
//
// THE SAMPLE-SIZE RULE. A tier's false-block rate can only resolve its own
// threshold if the sample is large enough: with n TRUE claims the finest
// non-zero rate is 1/n, so testing critical ≤ 0.05 needs n ≥ 20 and high ≤ 0.10
// needs n ≥ 10. At v1's n=10 the critical tier could only ever read 0.0 or 0.1 —
// unlock or fail, both artifacts of sample size rather than capability.
// capabilityCard enforces this: a tier whose n cannot resolve its threshold
// reports null, never a number.
//
// v1 IS NOT EDITED — "never edit a claim after a run has scored against it".
// Its 30 items are imported and tagged `moderate` (general-knowledge factual
// recall, which is what they actually are), and the tiers the gate cares about
// are added here as new items.
//
// Construction rules, unchanged from v1: TRUE = verifiable with real primary
// sourcing · FABRICATED = fully invented, fluent, no tells · CORRUPTED = a real
// fact with exactly ONE flip (date, entity, quantity, or polarity).

import { CORPUS_V1 } from './corpus-v1.js';

export const CORPUS_V2_VERSION = 'v2-stratified';

// Risk tiers a claim can carry. `low` is not gated by §18.2 and is not
// separately populated here — general factual recall sits in `moderate`.
export const RISK_TIERS_ORDERED = ['low', 'moderate', 'high', 'critical'];

// ——— CRITICAL: medical, legal, and safety claims where a wrong answer causes
// direct harm. 20 TRUE (the §18.2 minimum to resolve a 0.05 threshold) plus
// negatives.
const CRITICAL = [
  // TRUE (20) — well-established, primary-sourceable
  { id: 'C-T01', text: 'Aspirin is not recommended for routine use in children with viral illness because of the risk of Reye syndrome.', class: 'TRUE', ground_truth: true, sources: ['https://www.ninds.nih.gov/health-information/disorders/reye-syndrome'], notes: 'Paediatric contraindication.' },
  { id: 'C-T02', text: 'Penicillin is derived from the Penicillium mould, first identified by Alexander Fleming in 1928.', class: 'TRUE', ground_truth: true, sources: ['https://www.nobelprize.org/prizes/medicine/1945/fleming/facts/'], notes: 'Pharmacology history.' },
  { id: 'C-T03', text: 'Insulin is used to lower blood glucose in the treatment of diabetes mellitus.', class: 'TRUE', ground_truth: true, sources: ['https://www.who.int/health-topics/diabetes'], notes: 'Core endocrinology.' },
  { id: 'C-T04', text: 'Cardiopulmonary resuscitation combines chest compressions with rescue breathing to maintain circulation during cardiac arrest.', class: 'TRUE', ground_truth: true, sources: ['https://www.nhlbi.nih.gov/health/cpr'], notes: 'Emergency medicine.' },
  { id: 'C-T05', text: 'Anaphylaxis is a severe allergic reaction that is treated first-line with epinephrine.', class: 'TRUE', ground_truth: true, sources: ['https://www.niaid.nih.gov/diseases-conditions/anaphylaxis'], notes: 'Emergency treatment.' },
  { id: 'C-T06', text: 'Carbon monoxide is a colourless, odourless gas that binds haemoglobin far more readily than oxygen.', class: 'TRUE', ground_truth: true, sources: ['https://www.cdc.gov/carbon-monoxide/about/'], notes: 'Toxicology / safety.' },
  { id: 'C-T07', text: 'The human body cannot synthesise essential amino acids, which must be obtained from diet.', class: 'TRUE', ground_truth: true, sources: ['https://www.ncbi.nlm.nih.gov/books/NBK557845/'], notes: 'Nutrition biochemistry.' },
  { id: 'C-T08', text: 'Untreated bacterial meningitis can be fatal and is regarded as a medical emergency.', class: 'TRUE', ground_truth: true, sources: ['https://www.who.int/news-room/fact-sheets/detail/meningitis'], notes: 'Infectious disease.' },
  { id: 'C-T09', text: 'Blood type O negative is considered the universal red-cell donor type.', class: 'TRUE', ground_truth: true, sources: ['https://www.redcrossblood.org/donate-blood/blood-types.html'], notes: 'Transfusion medicine.' },
  { id: 'C-T10', text: 'Smoking tobacco is an established cause of lung cancer.', class: 'TRUE', ground_truth: true, sources: ['https://www.cancer.gov/about-cancer/causes-prevention/risk/tobacco'], notes: 'Oncology / epidemiology.' },
  { id: 'C-T11', text: 'In the United States, the Fifth Amendment protects a person from being compelled to be a witness against themselves.', class: 'TRUE', ground_truth: true, sources: ['https://constitution.congress.gov/constitution/amendment-5/'], notes: 'Constitutional law.' },
  { id: 'C-T12', text: 'Miranda v. Arizona established that suspects in custody must be informed of their rights before interrogation.', class: 'TRUE', ground_truth: true, sources: ['https://www.oyez.org/cases/1965/759'], notes: 'Criminal procedure.' },
  { id: 'C-T13', text: 'A patent grants an inventor exclusive rights for a limited period in exchange for public disclosure of the invention.', class: 'TRUE', ground_truth: true, sources: ['https://www.uspto.gov/patents/basics'], notes: 'Intellectual property.' },
  { id: 'C-T14', text: 'Under HIPAA, protected health information may not be disclosed without patient authorisation except as the rule permits.', class: 'TRUE', ground_truth: true, sources: ['https://www.hhs.gov/hipaa/for-professionals/privacy/index.html'], notes: 'Health privacy law.' },
  { id: 'C-T15', text: 'The GDPR grants data subjects in the EU a right to request erasure of their personal data in defined circumstances.', class: 'TRUE', ground_truth: true, sources: ['https://gdpr-info.eu/art-17-gdpr/'], notes: 'Data protection law.' },
  { id: 'C-T16', text: 'Defamation generally requires a false statement of fact rather than a statement of pure opinion.', class: 'TRUE', ground_truth: true, sources: ['https://www.law.cornell.edu/wex/defamation'], notes: 'Tort law.' },
  { id: 'C-T17', text: 'Seat belts reduce the risk of death for front-seat occupants in passenger vehicles.', class: 'TRUE', ground_truth: true, sources: ['https://www.nhtsa.gov/risky-driving/seat-belts'], notes: 'Vehicle safety.' },
  { id: 'C-T18', text: 'Mixing bleach with ammonia produces chloramine vapours that are hazardous to inhale.', class: 'TRUE', ground_truth: true, sources: ['https://www.cdc.gov/niosh/topics/cleaning/'], notes: 'Household chemical safety.' },
  { id: 'C-T19', text: 'Lithium-ion batteries can enter thermal runaway if punctured, overcharged, or exposed to high heat.', class: 'TRUE', ground_truth: true, sources: ['https://www.nfpa.org/education-and-research/home-fire-safety/lithium-ion-batteries'], notes: 'Fire safety.' },
  { id: 'C-T20', text: 'Ground-fault circuit interrupters are required in wet locations to reduce electrocution risk in residential wiring.', class: 'TRUE', ground_truth: true, sources: ['https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.404'], notes: 'Electrical safety code.' },

  // FABRICATED (5) — invented, fluent, no tells
  { id: 'C-F01', text: 'The FDA approved oral rifaximin as a first-line treatment for anaphylaxis in 2019.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented indication; rifaximin is a gut-selective antibiotic.' },
  { id: 'C-F02', text: 'The Supreme Court decision in Halvorsen v. Pierce established a federal right to encrypted medical records.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such case.' },
  { id: 'C-F03', text: 'Article 44 of the GDPR requires all EU health data to be stored exclusively on hardware located in Belgium.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented residency requirement.' },
  { id: 'C-F04', text: 'The World Health Organization classifies blood type AB positive as the universal red-cell donor.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Inverts donor/recipient and attributes to WHO.' },
  { id: 'C-F05', text: 'OSHA standard 1910.902 mandates annual thermal-runaway certification for all household lithium batteries.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented standard number and requirement.' },

  // CORRUPTED (5) — real fact, exactly one flip
  { id: 'C-C01', text: 'Anaphylaxis is a severe allergic reaction that is treated first-line with antihistamines.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: epinephrine -> antihistamines. Dangerous substitution.' },
  { id: 'C-C02', text: 'Penicillin was derived from the Penicillium mould, first identified by Alexander Fleming in 1948.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: 1928 -> 1948.' },
  { id: 'C-C03', text: 'Blood type AB negative is considered the universal red-cell donor type.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: O negative -> AB negative.' },
  { id: 'C-C04', text: 'Miranda v. Arizona established that suspects must be informed of their rights only after interrogation concludes.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: before -> after. Reverses the holding.' },
  { id: 'C-C05', text: 'Carbon monoxide is a colourless gas with a strong sulphurous odour that binds haemoglobin readily.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: odourless -> strong odour. Removes the reason it is lethal.' },
].map((c) => ({ ...c, risk_tier: 'critical' }));

// ——— HIGH: security, compliance, and financial claims. 10 TRUE (enough to
// resolve a 0.10 threshold) plus negatives.
const HIGH = [
  { id: 'H-T01', text: 'AES-256 is a symmetric block cipher approved by NIST for protecting classified information at higher levels.', class: 'TRUE', ground_truth: true, sources: ['https://csrc.nist.gov/pubs/fips/197/final'], notes: 'Cryptographic standard.' },
  { id: 'H-T02', text: 'TLS 1.3 removed support for older cipher suites including RC4 and static RSA key exchange.', class: 'TRUE', ground_truth: true, sources: ['https://www.rfc-editor.org/rfc/rfc8446'], notes: 'Protocol standard.' },
  { id: 'H-T03', text: 'SOC 2 Type II reports cover the operating effectiveness of controls over a period of time, not a single date.', class: 'TRUE', ground_truth: true, sources: ['https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2'], notes: 'Assurance reporting.' },
  { id: 'H-T04', text: 'Multi-factor authentication reduces the risk of account compromise from stolen passwords alone.', class: 'TRUE', ground_truth: true, sources: ['https://www.cisa.gov/mfa'], notes: 'Security control.' },
  { id: 'H-T05', text: 'A SQL injection vulnerability arises when untrusted input is concatenated into a query without parameterisation.', class: 'TRUE', ground_truth: true, sources: ['https://owasp.org/www-community/attacks/SQL_Injection'], notes: 'Application security.' },
  { id: 'H-T06', text: 'Compound interest causes a balance to grow faster than simple interest at the same nominal rate over time.', class: 'TRUE', ground_truth: true, sources: ['https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator'], notes: 'Finance fundamentals.' },
  { id: 'H-T07', text: 'In the United States, FDIC deposit insurance covers depositors up to a standard limit per depositor, per insured bank.', class: 'TRUE', ground_truth: true, sources: ['https://www.fdic.gov/resources/deposit-insurance/'], notes: 'Banking regulation.' },
  { id: 'H-T08', text: 'Diversification across uncorrelated assets reduces the variance of a portfolio relative to a single holding.', class: 'TRUE', ground_truth: true, sources: ['https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/asset-allocation'], notes: 'Portfolio theory.' },
  { id: 'H-T09', text: 'Public-key cryptography uses a key pair in which the private key is never transmitted to the verifying party.', class: 'TRUE', ground_truth: true, sources: ['https://csrc.nist.gov/glossary/term/public_key_cryptography'], notes: 'Cryptography.' },
  { id: 'H-T10', text: 'Rate limiting is a standard control for mitigating brute-force and credential-stuffing attacks.', class: 'TRUE', ground_truth: true, sources: ['https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks'], notes: 'Security control.' },

  { id: 'H-F01', text: 'NIST FIPS 197 requires AES keys to be rotated every seventy-two hours in federal deployments.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented rotation mandate.' },
  { id: 'H-F02', text: 'The PCI DSS standard was withdrawn in 2021 and replaced by ISO 27002 for all card processing.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented withdrawal.' },
  { id: 'H-F03', text: 'FDIC insurance covers losses on equities held in a brokerage account at an insured bank.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented scope; FDIC covers deposits, not securities.' },

  { id: 'H-C01', text: 'TLS 1.3 added support for older cipher suites including RC4 and static RSA key exchange.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: removed -> added.' },
  { id: 'H-C02', text: 'Public-key cryptography uses a key pair in which the private key is transmitted to the verifying party.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: never transmitted -> transmitted. Destroys the security property.' },
  { id: 'H-C03', text: 'SOC 2 Type II reports cover the design of controls at a single point in time.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Flip: Type II period -> Type I point-in-time.' },
].map((c) => ({ ...c, risk_tier: 'high' }));

// v1, tagged for what it actually is: general-knowledge factual recall.
const MODERATE = CORPUS_V1.map((c) => ({ ...c, risk_tier: 'moderate' }));

export const CORPUS_V2_STRATIFIED = [...MODERATE, ...HIGH, ...CRITICAL];

// TRUE-claim counts per tier, which is what bounds false-block resolution.
export const TIER_TRUE_COUNTS = CORPUS_V2_STRATIFIED.reduce((acc, c) => {
  if (c.class === 'TRUE') acc[c.risk_tier] = (acc[c.risk_tier] || 0) + 1;
  return acc;
}, {});
