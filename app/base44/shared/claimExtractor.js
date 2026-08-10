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
function splitSentences(text) {
  return String(text || '')
    .replace(/\n+/g, ' ')
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 1000);
}

// Factual indicators — a sentence is a "claim" if it contains at least one.
const FACTUAL_PATTERNS = [
  /\b\d+%\b/, /\$\d/, /\b\d{4}\b/, /\b\d+[.,]?\d*\s*(million|billion|trillion|thousand)\b/i,
  /\bincreas/i, /\bdecreas/i, /\breduc/i, /\bimprov/i, /\bshows?\b/i, /\bdemonstrat/i,
  /\bstudy\b/i, /\bresearch\b/i, /\bproven\b/i, /\bguaranteed?\b/i, /\bsecure/i, /\bencrypt/i,
  /\bcomplian/i, /\baccord/i, /\breport/i, /\bfound\b/i, /\bresult/i,
  /\bis\b/i, /\bare\b/i, /\bwas\b/i, /\bwere\b/i, /\bwill\b/i, /\bcan\b/i, /\bhas\b/i, /\bhave\b/i,
  /\balways\b/i, /\bnever\b/i, /\bevery\b/i, /\ball\b/i, /\bnone\b/i,
];

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
    const isFactual = FACTUAL_PATTERNS.some((p) => p.test(sentence));
    if (!isFactual) continue;
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