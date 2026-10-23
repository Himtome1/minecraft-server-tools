// Rate limiter + result cache, all in memory (nothing is written to disk).
// - per client: `perClient` checks per window and one check at a time;
// - global: `global` network checks per window (cache hits don't count);
// - cache: results kept `cacheMs` per normalised address, swept when it grows past `maxCache`.

export function makeLimiter({ perClient = 10, global = 120, windowMs = 60_000, cacheMs = 60_000, maxCache = 2000, nowMs = () => Date.now() } = {}) {
  const hits = new Map(), busy = new Set(), cache = new Map();
  const globalHits = [];
  const prune = (arr, t) => { while (arr.length && t - arr[0] >= windowMs) arr.shift(); return arr; };
  function sweep(t) {
    if (hits.size > 5000) for (const [k, v] of hits) if (!prune(v, t).length) hits.delete(k);
    if (cache.size > maxCache) for (const [k, v] of cache) if (t - v.at >= cacheMs) cache.delete(k);
  }
  return {
    now: nowMs,
    /** Counts one request for `client`. false = over the per-client limit or a check already running. */
    admit(client, t = nowMs()) {
      sweep(t);
      const mine = prune(hits.get(client) || [], t);
      hits.set(client, mine);
      if (mine.length >= perClient || busy.has(client)) return false;
      mine.push(t);
      return true;
    },
    /** Fresh cached entry { at, result } or null. */
    cached(key, t = nowMs()) { const c = cache.get(key); return c && t - c.at < cacheMs ? c : null; },
    /** Takes a global slot for a network check. false = global cap reached. */
    takeGlobal(t = nowMs()) { prune(globalHits, t); if (globalHits.length >= global) return false; globalHits.push(t); return true; },
    start(client) { busy.add(client); },
    end(client) { busy.delete(client); },
    store(key, result, at = nowMs()) { cache.set(key, { at, result }); },
    _state: { hits, busy, cache, globalHits },
  };
}
