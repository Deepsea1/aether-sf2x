// Domain-specific authoritative source grounding.
// A warrant stamped "valid" used to mean "consistent with Google results at
// fetch time" — which is insufficient for medicine, legal, and finance where
// the provenance is only as trustworthy as its sources. This registry tells
// the verifier which sources are AUTHORITATIVE per domain, so the warrant can
// distinguish "grounded in PubMed / SEC EDGAR / statutory corpora" from
// "grounded in a random blog that ranked on Google." High-stakes domains apply
// an authoritative-grounding penalty when claims are only backed by generic web.

export const AUTHORITATIVE_SOURCES = {
  medicine: {
    label: 'Medicine',
    domains: [
      'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'nlm.nih.gov',
      'cochranelibrary.com', 'cochrane.org',
      'cdc.gov', 'fda.gov', 'who.int', 'nih.gov',
      'mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org',
      'uptodate.com', 'bmj.com', 'nejm.org', 'thelancet.com',
      'cms.gov', 'clinicaltrials.gov',
    ],
    instruction: 'For medical claims, authoritative sources are peer-reviewed literature (PubMed/NCBI), Cochrane reviews, and official guidance (CDC, FDA, WHO, NIH, Mayo Clinic, Cleveland Clinic, UpToDate, NEJM, BMJ, Lancet). A health claim grounded only in a general-health blog, news article, or commercial site is NOT authoritatively grounded even if it happens to agree.',
    penalty: 12, // trust points subtracted when no authoritative source backs any claim
  },
  finance: {
    label: 'Finance',
    domains: [
      'sec.gov', 'edgar.sec.gov', 'sec.gov/cgi-bin',
      'federalreserve.gov', 'federalreserveconsumerhelp.gov',
      'fasb.org', 'ifrs.org',
      'irs.gov', 'treasury.gov',
      'finra.org', 'sipc.org', 'consumerfinance.gov',
      'imf.org', 'bis.org', 'worldbank.org',
      'bloomberg.com', 'reuters.com',
    ],
    instruction: 'For financial claims, authoritative sources are primary regulators and filings: SEC EDGAR filings, Federal Reserve, FASB/IFRS standards, IRS, FINRA, IMF, Treasury. A financial claim grounded only in a finance blog, newsletter, or vendor marketing is NOT authoritatively grounded.',
    penalty: 12,
  },
  legal: {
    label: 'Legal',
    domains: [
      'law.cornell.edu', 'lii.law.cornell.edu',
      'gov.uk', 'legislation.gov.uk',
      'law.justia.com', 'supremecourt.gov', 'uscourts.gov',
      'congress.gov', 'house.gov', 'senate.gov',
      'state.gov', 'ecfr.gov', 'regulations.gov',
      'europa.eu', 'eur-lex.europa.eu',
    ],
    instruction: 'For legal claims, authoritative sources are primary legal authorities: statutes (Cornell LII, congress.gov, legislation.gov.uk), case law (supremecourt.gov, Justia), regulations (ecfr.gov, regulations.gov), and official government sites. A legal claim grounded only in a law-firm blog or secondary commentary is NOT authoritatively grounded — it must trace to the primary authority.',
    penalty: 10,
  },
  science: {
    label: 'Science',
    domains: [
      'arxiv.org', 'doi.org', 'nature.com', 'science.org',
      'sciencedirect.com', 'springer.com', 'wiley.com', 'tandfonline.com',
      'nsf.gov', 'nasa.gov', 'noaa.gov', 'usgs.gov',
      'aps.org', 'iop.org', 'pnas.org',
    ],
    instruction: 'For scientific claims, authoritative sources are peer-reviewed journals (Nature, Science, arXiv, DOI-indexed publications) and official research bodies (NSF, NASA, NOAA, USGS). A scientific claim grounded only in a science-news summary is NOT authoritatively grounded.',
    penalty: 8,
  },
  defense: {
    label: 'Defense',
    domains: [
      'defense.gov', 'dod.gov', 'darpa.mil', 'army.mil', 'navy.mil',
      'af.mil', 'usmc.mil', 'dla.mil',
      'gao.gov', 'crsreports.gov', 'congress.gov',
      'nro.gov', 'nist.gov',
    ],
    instruction: 'For defense claims, authoritative sources are official .mil / DoD, DARPA, GAO, CRS, and NIST. A defense claim grounded only in a defense-trade publication is NOT authoritatively grounded.',
    penalty: 14,
  },
  compliance: {
    label: 'Compliance',
    domains: [
      'sec.gov', 'finra.org', 'consumerfinance.gov',
      'hhs.gov', 'hipaa.gov', 'ec.europa.eu',
      'ico.org.uk', 'gdpr.eu', 'nist.gov',
      'treasury.gov', 'fincen.gov',
    ],
    instruction: 'For compliance claims, authoritative sources are the issuing regulator (SEC, FINRA, HHS/HIPAA, EU/ICO for GDPR, NIST, FinCEN). A compliance claim grounded only in a vendor whitepaper is NOT authoritatively grounded.',
    penalty: 12,
  },
  general: {
    label: 'General',
    domains: [],
    instruction: 'No domain-specific authoritative source set applies; standard credible-source verification is sufficient.',
    penalty: 0,
  },
  technology: {
    label: 'Technology',
    domains: [],
    instruction: 'No domain-specific authoritative source set applies; standard credible-source verification is sufficient.',
    penalty: 0,
  },
};

export function authoritativeFor(domain) {
  const key = String(domain || 'general').toLowerCase();
  return AUTHORITATIVE_SOURCES[key] || AUTHORITATIVE_SOURCES.general;
}

// Classify a cited source URL as authoritative for the domain (substring match
// against the registry, case-insensitive). Returns the matched domain or null.
export function classifySource(url, domain) {
  const u = String(url || '').toLowerCase();
  if (!u) return null;
  const reg = authoritativeFor(domain);
  return (reg.domains || []).find((d) => u.includes(d)) || null;
}

// Build the authoritative-grounding summary from the verifier's per-claim
// verdicts + the cited sources. Returns an object persisted on the Warrant.
export function summarizeGrounding(claims, sources, domain) {
  const reg = authoritativeFor(domain);
  const cited = Array.isArray(sources) ? sources.map((s) => String(s)) : [];
  const authoritativeSourcesCited = cited
    .map((s) => classifySource(s, domain))
    .filter(Boolean);
  const distinctAuthSources = [...new Set(authoritativeSourcesCited)];
  const claimsAuthoritativelyGrounded = (claims || []).filter((c) => c.authoritative_grounding === true).length;
  const totalClaims = (claims || []).length || 1;
  return {
    domain: reg.label,
    has_authoritative_sources: distinctAuthSources.length > 0,
    authoritative_source_count: distinctAuthSources.length,
    authoritative_sources: distinctAuthSources,
    claims_authoritatively_grounded: claimsAuthoritativelyGrounded,
    total_claims: totalClaims,
    grounding_ratio: totalClaims ? claimsAuthoritativelyGrounded / totalClaims : 0,
    penalty_applied: 0, // filled in by calibrateTrust path
  };
}