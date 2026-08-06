/**
 * Rate limiting — the denial-of-wallet guard.
 *
 * Each rate-limited request increments four KV counters (per-identity and per-IP,
 * each in a per-minute and a per-day window). If any counter is already at its cap
 * the request is refused with a 429 + Retry-After BEFORE the paid upstream
 * warrantApi call is made.
 *
 * KV is eventually consistent, so these counters are best-effort (a burst that
 * lands on multiple edge locations within the consistency window can slip a few
 * extra calls through). That is acceptable for a denial-of-wallet backstop — it
 * caps sustained abuse, which is the cost risk. It is NOT an auth control.
 *
 * Storage: uses env.RL_KV if bound, else falls back to env.WARRANTS with an `rl:`
 * key prefix (short TTLs keep it well clear of the `v:` verdict cache). If neither
 * is bound, rate limiting is skipped (fail-open on the RL layer only — auth is
 * still enforced separately and remains fail-closed).
 */

function rlStore(env) {
  return env.RL_KV || env.WARRANTS || null;
}

function intVar(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

/**
 * @returns {Promise<{limited: boolean, retryAfter: number}>}
 */
export async function checkRateLimit(env, identity, ip) {
  const kv = rlStore(env);
  if (!kv) return { limited: false, retryAfter: 0 };

  const perMin = intVar(env.RL_PER_MIN, 20);
  const perDay = intVar(env.RL_PER_DAY, 200);
  const now = Date.now();
  const minBucket = Math.floor(now / 60000);
  const dayBucket = Math.floor(now / 86400000);
  const id = identity || 'anon';
  const who = ip || 'noip';

  // TTLs are padded past the window so a counter cannot be undercounted at a
  // boundary; KV enforces a 60s minimum expirationTtl.
  const counters = [
    { k: `rl:m:${id}:${minBucket}`, cap: perMin, ttl: 120, window: 'min' },
    { k: `rl:m:ip:${who}:${minBucket}`, cap: perMin, ttl: 120, window: 'min' },
    { k: `rl:d:${id}:${dayBucket}`, cap: perDay, ttl: 90000, window: 'day' },
    { k: `rl:d:ip:${who}:${dayBucket}`, cap: perDay, ttl: 90000, window: 'day' },
  ];

  let current;
  try {
    current = await Promise.all(counters.map((c) => kv.get(c.k)));
  } catch {
    // KV read failure — do not block the request on the RL layer.
    return { limited: false, retryAfter: 0 };
  }

  for (let i = 0; i < counters.length; i++) {
    const count = parseInt(current[i] || '0', 10) || 0;
    if (count >= counters[i].cap) {
      const retryAfter =
        counters[i].window === 'min'
          ? 60 - Math.floor((now % 60000) / 1000)
          : 86400 - Math.floor((now % 86400000) / 1000);
      return { limited: true, retryAfter: Math.max(1, retryAfter) };
    }
  }

  try {
    await Promise.all(
      counters.map((c, i) => {
        const count = parseInt(current[i] || '0', 10) || 0;
        return kv.put(c.k, String(count + 1), { expirationTtl: c.ttl });
      })
    );
  } catch {
    // Non-fatal: if the increment fails we simply don't count this request.
  }

  return { limited: false, retryAfter: 0 };
}
