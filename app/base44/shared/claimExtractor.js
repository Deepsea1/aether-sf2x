// Claim extractor — decomposes text (answers, PR diffs, documents) into discrete
// testable claims. The deterministic first pass splits on sentence boundaries
// and filters to sentences that contain factual indicators. Full NLP-based
// decomposition would use an LLM (deferred until integration credits reset);
// this pass is fast, free, and sufficient for the GitHub PR verification wedge.
//
// Output: array of Claim-shaped objects ready for persistence.

import { flashScan } from './aetherFlash.js';

// Sentence splitter — handles common sentence terminators while preserving
// abbreviations roughly (a full sentence boundary parser would be better, but
// this is sufficient for claim extraction from diffs and markdown).
// MIN_WEAK is the old `length > 20`. MIN_STRONG is lower because a sentence
// carrying a hard quantity is material even when short — the old floor dropped
// "Uptime was 99.99%." (18 chars) outright, which the §6.3 corpus caught.
const MIN_STRONG_LEN = 12;
const MIN_WEAK_LEN = 21;

function splitSentences(text) {
  return String(text || '')
    .replace(/\n+/g, ' ')
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_STRONG_LEN && s.length < 1000);
}

// Evidence is tiered, because the old flat list let a bare copula ("is", "are")
// carry the same weight as a measured quantity. That cost precision on opinion
// ("We are proud of...") while still missing plainly material statements whose
// verb happened to be absent from the list ("The SDK supports Python 3.9").
//
// STRONG — a hard, checkable assertion: quantities, money, dates, standards,
// and verbs that state a fact about the system. Sufficient on its own.
const STRONG_PATTERNS = [
  // Quantities. NOTE: the previous /\b\d+%\b/ could never match a percentage
  // followed by a space — '%' and ' ' are both non-word characters, so the
  // trailing \b always failed. Every percentage claim that was ever extracted
  // got in via some other keyword.
  /\d+(\.\d+)?\s*%/,
  /\$\s?\d/, /\b\d{4}\b/,
  /\b\d+[.,]?\d*\s*(million|billion|trillion|thousand|k|m|bn)\b/i,
  /\b\d+(\.\d+)?\s*(ms|s|sec|seconds?|minutes?|hours?|days?|weeks?|months?|years?|gb|mb|kb|tb)\b/i,
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\s+(\w+\s+)?(per|requests?|users?|transactions?|verifications?|days?|seconds?|minutes?)\b/i,
  // Standards, certifications, guarantees.
  /\bsoc\s*2\b/i, /\biso\s*\d{4,5}\b/i, /\bhipaa\b/i, /\bgdpr\b/i, /\baes-?\d{3}\b/i,
  /\bcomplian/i, /\bcertif/i, /\bencrypt/i, /\bproven\b/i, /\bguaranteed?\b/i,
  // Verbs that assert a fact about the system. The originals plus the ones the
  // gold corpus showed missing.
  /\bincreas/i, /\bdecreas/i, /\breduc/i, /\bimprov/i, /\bshows?\b/i, /\bdemonstrat/i,
  /\bstudy\b/i, /\bresearch\b/i, /\baccord/i, /\breport/i, /\bfound\b/i, /\bresult/i,
  /\bsupports?\b/i, /\brequires?\b/i, /\bincludes?\b/i, /\bprovides?\b/i, /\bships?\b/i,
  /\bscored?\b/i, /\bscores\b/i, /\bachieved?\b/i, /\bachieves\b/i, /\bbegins?\b/i,
  /\bstarts?\b/i, /\bdrops?\b/i, /\bremoves?\b/i, /\bdeletes?d?\b/i, /\bbilled?\b/i,
  /\bcosts?\b/i, /\bfell\b/i, /\brose\b/i, /\bgrew\b/i, /\bexceeds?\b/i, /\blimits?\b/i,
  /\breturns?\b/i, /\bdefaults?\b/i, /\bmeasured\b/i, /\breached\b/i, /\bprocesses\b/i,
  /\bkicks?\s+in\b/i, /\bsupported\b/i, /\bdeprecated\b/i, /\bremoved\b/i,
  /\balways\b/i, /\bnever\b/i,
];

// WEAK — a copula or modal. Only enough on a longer sentence, where there is
// more likely to be substance around it.
const WEAK_PATTERNS = [
  /\bis\b/i, /\bare\b/i, /\bwas\b/i, /\bwere\b/i, /\bwill\b/i, /\bcan\b/i,
  /\bhas\b/i, /\bhave\b/i, /\bevery\b/i, /\ball\b/i, /\bnone\b/i,
];

// HEDGE — speculation, opinion, intent, and questions assert nothing testable.
// These VETO extraction regardless of other evidence: "we think latency might
// drop by 40%" contains a quantity but makes no claim, and treating it as one
// means the gate can block a sentence that never asserted anything.
const HEDGE_PATTERNS = [
  /\bmight\b/i, /\bmaybe\b/i, /\bperhaps\b/i, /\bpossibly\b/i, /\bprobably\b/i,
  /\bwe think\b/i, /\bwe believe\b/i, /\bwe feel\b/i, /\bwe are proud\b/i,
  /\bworth (exploring|considering)\b/i, /\bconsider(ing)?\b/i, /\bshould we\b/i,
  /\bwe hope\b/i, /\bseems?\b/i, /\bappears?\b/i, /\bcould be\b/i, /\bmay be\b/i,
];

// A sentence is a claim when it is not hedged and carries strong evidence, or
// weak evidence with enough length to be a real statement.
function isClaimSentence(sentence) {
  if (/\?\s*$/.test(sentence)) return false;
  if (HEDGE_PATTERNS.some((p) => p.test(sentence))) return false;
  if (STRONG_PATTERNS.some((p) => p.test(sentence))) return true;
  return sentence.length >= MIN_WEAK_LEN && WEAK_PATTERNS.some((p) => p.test(sentence));
}

// Claim category classifier — keyword-based mapping to the spec's categories.
export function classifyClaim(text) {
  const t = String(text || '').toLowerCase();
  if (/benchmark|outperform|faster|slower|sota|state.of.the.art|reduces by|improves by|\d+%\s+(better|worse|faster)/.test(t)) return 'benchmark_claim';
  if (/secur|encrypt|complian|gdpr|hipaa|soc\s*2|iso\s*27001|vulnerab|breach|protected/.test(t)) return 'security_claim';
  if (/\$|revenue|profit|earnings|financial|portfolio|roi|investment/.test(t)) return 'financial_claim';
  if (/legal|statute|jurisdiction|liab|court|ruling|regulation/.test(t)) return 'legal_claim';
  if (/diagnos|treatment|clinical|patient|medication|dosage|medical|health/.test(t)) return 'medical_claim';
  if (/api|endpoint|service|deploy|infrastruct|kubernetes|docker|latency|throughput/.test(t)) return 'technical_claim';
  return 'factual_claim';
}

// Extract the subject/predicate/object heuristically. This is a simplified
// decomposition — a full NLP parse would be more accurate but needs an LLM.
function decomposeClaim(text) {
  const t = String(text || '').trim();
  // Try to find "X does Y" or "X is Y" patterns.
  const isMatch = t.match(/^(.{5,60}?)\s+(?:is|are|was|were)\s+(.{5,200})/i);
  if (isMatch) return { subject: isMatch[1].trim(), predicate: 'is', object: isMatch[2].trim() };
  const reducesMatch = t.match(/^(.{5,60}?)\s+(reduces?|improves?|increases?|decreases?)\s+(.{5,200})/i);
  if (reducesMatch) return { subject: reducesMatch[1].trim(), predicate: reducesMatch[2].toLowerCase(), object: reducesMatch[3].trim() };
  // Fallback: subject is first noun phrase (first few words), object is the rest.
  const words = t.split(/\s+/);
  if (words.length > 6) {
    return { subject: words.slice(0, 4).join(' '), predicate: 'asserts', object: words.slice(4).join(' ') };
  }
  return { subject: t.slice(0, 60), predicate: 'asserts', object: t.slice(60) };
}

// Extract claims from a text block (answer, document, etc.).
export function extractClaims(text, { source_asset_type = 'answer_version', source_asset_id = null, domain = 'general', tenant_id = null } = {}) {
  const sentences = splitSentences(text);
  const claims = [];
  for (const sentence of sentences) {
    if (!isClaimSentence(sentence)) continue;
    const category = classifyClaim(sentence);
    const { subject, predicate, object } = decomposeClaim(sentence);
    const flash = flashScan(sentence, { domain });
    claims.push({
      text: sentence,
      category,
      subject,
      predicate,
      object,
      time_scope: null,
      jurisdiction: null,
      risk_level: category === 'security_claim' || category === 'medical_claim' || category === 'legal_claim' ? 'high' : 'medium',
      extraction_confidence: 0.7, // deterministic extraction — moderate confidence
      source_asset_type,
      source_asset_id,
      source_excerpt: sentence.slice(0, 200),
      flash_signals: flash.signals,
      verdict_status: 'pending',
      policy_decision: flash.recommendation === 'block' ? 'block' : (flash.recommendation === 'warn' ? 'warn' : 'pending'),
      tenant_id,
    });
  }
  return claims;
}

// Extract claims from a GitHub PR diff — parses added lines and tracks file/line
// position so inline PR review annotations can be posted. Groups consecutive
// added lines into text blocks per file/hunk, then extracts claims from each.
export function extractClaimsFromDiff(diff, { owner, repo, pull_number, head_sha, domain = 'general', tenant_id = null } = {}) {
  const lines = String(diff || '').split('\n');
  let currentFile = null;
  let newLineNum = 0;
  const blocks = []; // { text, file, line }
  let currentBlock = null;

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      currentBlock = null;
      continue;
    }
    if (line.startsWith('+++')) {
      currentFile = line.slice(4).replace(/^b\//, '');
      currentBlock = null;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/);
      if (m) newLineNum = parseInt(m[1], 10);
      currentBlock = null;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const text = line.slice(1).trim();
      if (text.length > 0) {
        if (!currentBlock || currentBlock.file !== currentFile) {
          currentBlock = { text: '', file: currentFile, line: newLineNum };
          blocks.push(currentBlock);
        }
        currentBlock.text = currentBlock.text ? currentBlock.text + ' ' + text : text;
      }
      newLineNum++;
      continue;
    }
    if (line.startsWith('-')) { currentBlock = null; continue; }
    // context line
    newLineNum++;
    currentBlock = null;
  }

  const source_asset_id = pull_number ? `pr:${owner}/${repo}#${pull_number}@${head_sha}` : null;
  const claims = [];
  for (const block of blocks) {
    const blockClaims = extractClaims(block.text, {
      source_asset_type: 'pr_diff',
      source_asset_id,
      domain,
      tenant_id,
    });
    for (const c of blockClaims) {
      c.file_path = block.file;
      c.diff_line = block.line;
    }
    claims.push(...blockClaims);
  }
  return claims;
}