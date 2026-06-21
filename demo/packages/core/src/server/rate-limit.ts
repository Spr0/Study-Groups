// =============================================================================
// Light, best-effort in-memory per-IP rate limiter. Per function instance; plenty
// for a single-room demo. Not a security control.
// =============================================================================

export type RateLimiter = (ip: string) => boolean;

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { start: number; count: number }>();
  return (ip: string): boolean => {
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now - rec.start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return false;
    }
    rec.count += 1;
    return rec.count > limit;
  };
}
