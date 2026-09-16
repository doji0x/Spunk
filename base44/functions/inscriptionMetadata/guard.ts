// In-memory response cache and per-IP rate limit for the public metadata endpoint.
// Both live for the lifetime of a warm instance, which absorbs marketplace/pump.fun bursts before they reach the paid RPC.
const cacheTtlMs = 10 * 60 * 1000;
const rateWindowMs = 60 * 1000;
const rateLimit = 60;
const cache = new Map();
const hits = new Map();

function prune(map, now) {
  if (map.size < 2000) return;
  for (const [key, entry] of map) if (entry.expires <= now) map.delete(key);
}

// Bodies are stored as bytes, never as Response objects: a cloned Response's stream locks once read in this runtime.
export function cached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) { cache.delete(key); return null; }
  return new Response(entry.body, { headers: entry.headers });
}

export function remember(key, body, headers) {
  const now = Date.now();
  prune(cache, now);
  cache.set(key, { body, headers, expires: now + cacheTtlMs });
  return new Response(body, { headers });
}

export function rateLimited(req) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  prune(hits, now);
  const entry = hits.get(ip);
  if (!entry || entry.expires <= now) { hits.set(ip, { count: 1, expires: now + rateWindowMs }); return false; }
  entry.count += 1;
  return entry.count > rateLimit;
}