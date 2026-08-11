// Independence analysis v1 (plan §5.6) — citation count is not corroboration.
//
// Clusters evidence items by ORIGIN so corroboration can be counted per
// independent origin rather than per citation: four syndicated copies of one
// wire story are one voice, not four. Three merge signals, all deterministic:
//   1. same registrable domain                       → reason 'domain'
//   2. identical content_hash                        → reason 'content_hash'
//   3. near-duplicate excerpts (normalized 8-word
//      shingles, Jaccard >= 0.6)                     → reason 'near_dup'
//
// Fail closed toward independence UNCERTAINTY: excerpts under 8 words produce
// no shingles and can never near-dup match — we do not merge what we cannot
// prove shares an origin, and we do not claim independence either; a
// short-excerpt pair simply never triggers the near_dup reason. Pure
// functions, no I/O, no throwing on malformed input.

// Common ccTLD second-level registries where the registrable name is THREE
// labels (bbc.co.uk), not two. HONEST APPROXIMATION: a small hand-picked list,
// not the full Public Suffix List — rare multi-part suffixes not listed here
// fall back to the last-two-labels heuristic and may over-merge (e.g. two
// different *.pvt.k12.ma.us schools would read as one origin). Good enough to
// keep bbc.co.uk and news.co.uk from reading as the same origin without
// pulling in a PSL dependency.
const CCTLD_SECOND_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'com.br', 'org.br',
  'com.mx', 'org.mx',
  'co.in', 'net.in', 'org.in',
  'co.nz', 'net.nz', 'org.nz',
  'co.za', 'org.za',
  'com.cn', 'net.cn', 'org.cn',
  'com.tw', 'org.tw',
  'co.kr', 'or.kr',
  'com.sg', 'com.hk', 'com.ar', 'com.tr',
]);

// Registrable domain of a URL — the last-two-labels heuristic plus the ccTLD
// second-level list above (documented approximation; no full PSL). Strips
// scheme, userinfo, path/query/fragment, port, and trailing dots; lowercases.
// IP literals cluster by exact IP. Never throws — unparseable input returns
// whatever host-ish string remains ('' when none).
export function registrableDomain(url) {
  let s = String(url ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const cut = s.search(/[/?#]/);
  if (cut !== -1) s = s.slice(0, cut);
  const at = s.lastIndexOf('@');
  if (at !== -1) s = s.slice(at + 1);
  const b6 = s.match(/^\[([^\]]*)\]/);
  if (b6) return b6[1]; // bracketed IPv6 literal (port, if any, is outside the brackets)
  const colons = (s.match(/:/g) || []).length;
  if (colons === 1) s = s.replace(/:\d+$/, ''); // host:port
  else if (colons > 1) return s; // bare IPv6 literal → exact-IP cluster
  s = s.replace(/\.+$/, '');
  if (!s) return '';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return s; // IPv4 literal → exact-IP cluster
  const labels = s.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return CCTLD_SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

const SHINGLE_SIZE = 8;
const NEAR_DUP_JACCARD = 0.6;

// Normalize for shingling: lowercase, strip punctuation, collapse whitespace.
function normalizedWords(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function shingleSet(text) {
  const words = normalizedWords(text);
  const out = new Set();
  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) out.add(words.slice(i, i + SHINGLE_SIZE).join(' '));
  return out;
}

// Near-duplicate excerpts: 8-word shingle Jaccard >= 0.6. An excerpt under 8
// words yields an empty shingle set, so it can never match (fail closed toward
// uncertainty — no merge without proof, no independence claim either).
function nearDuplicate(a, b) {
  if (!a.size || !b.size) return false;
  let inter = 0;
  for (const sh of a) if (b.has(sh)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 && inter / union >= NEAR_DUP_JACCARD;
}

/**
 * Cluster evidence items by origin. Deterministic and pure.
 *
 * @param {Array<{url?: string, content_hash?: string, excerpt?: string}>} items
 * @returns {{
 *   clusters: Array<{origin: string, members: number[], reason: 'domain'|'content_hash'|'near_dup'}>,
 *   independent_origins: number,
 *   flags: string[],
 * }}
 * Merge rules: same registrable domain OR identical content_hash OR
 * near-duplicate excerpt → same cluster. Items with no resolvable domain are
 * NEVER merged on the empty domain (unknown ≠ same origin — fail closed);
 * they only merge via content_hash or near_dup. Flags: 'syndicated_copies'
 * when an identical content_hash spans two different registrable domains,
 * 'single_origin_corroboration' when 2+ items collapse to a single cluster.
 */
export function clusterSources(items) {
  const list = Array.isArray(items) ? items : [];
  const n = list.length;
  const domains = list.map((it) => registrableDomain(it && it.url));
  const hashes = list.map((it) => {
    const h = it && it.content_hash;
    return typeof h === 'string' && h.trim() ? h.trim().toLowerCase() : null;
  });
  const shingles = list.map((it) => shingleSet(it && it.excerpt));

  // Union-find over item indices; the smallest index leads each set.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };

  let syndicated = false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameDomain = !!domains[i] && domains[i] === domains[j];
      const sameHash = !!hashes[i] && hashes[i] === hashes[j];
      if (sameHash && !!domains[i] && !!domains[j] && domains[i] !== domains[j]) syndicated = true;
      if (sameDomain || sameHash || nearDuplicate(shingles[i], shingles[j])) union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const clusters = [...groups.values()]
    .map((members) => members.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((members) => {
      const lead = members[0];
      // reason: 'domain' when every member shares one registrable domain
      // (singletons included — a lone source is its own origin); else
      // 'content_hash' when an identical hash did the merging; else
      // 'near_dup'.
      let reason = 'domain';
      const allSameDomain = members.every((m) => !!domains[m] && domains[m] === domains[lead]);
      if (members.length > 1 && !allSameDomain) {
        let viaHash = false;
        for (let x = 0; x < members.length && !viaHash; x++) {
          for (let y = x + 1; y < members.length && !viaHash; y++) {
            if (hashes[members[x]] && hashes[members[x]] === hashes[members[y]]) viaHash = true;
          }
        }
        reason = viaHash ? 'content_hash' : 'near_dup';
      }
      const origin = domains[lead] || (hashes[lead] ? `hash:${hashes[lead].slice(0, 12)}` : 'unknown');
      return { origin, members, reason };
    });

  const flags = [];
  if (syndicated) flags.push('syndicated_copies');
  if (n >= 2 && clusters.length === 1) flags.push('single_origin_corroboration');

  return { clusters, independent_origins: clusters.length, flags };
}
