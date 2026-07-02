// app/ratelimit.server.ts
//
// Tiny in-memory fixed-window rate limiter. Process-local (fine for a single
// node); swap for a shared store (Redis) if you scale horizontally. Used to
// throttle the second-factor email + verify endpoints so a stolen password
// can't be turned into unlimited code emails or brute-forced codes.

interface Win {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterMs: number };
  reset(key?: string): void;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Win>();
  // Bound memory: an attacker rotating the rate-limit key (e.g. spoofed IPs)
  // could otherwise grow this map without limit. Sweep expired entries at most
  // once per window so the cost stays amortized O(1) per check.
  let nextSweep = Date.now() + windowMs;
  const sweep = (now: number): void => {
    if (now < nextSweep) return;
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    nextSweep = now + windowMs;
  };
  return {
    check(key) {
      const now = Date.now();
      sweep(now);
      const w = windows.get(key);
      if (!w || w.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, retryAfterMs: 0 };
      }
      if (w.count >= limit) return { ok: false, retryAfterMs: w.resetAt - now };
      w.count += 1;
      return { ok: true, retryAfterMs: 0 };
    },
    reset(key) {
      if (key === undefined) windows.clear();
      else windows.delete(key);
    },
  };
}

// Proxy-set forwarding headers are trivially spoofable by a direct client, so we
// only trust them when explicitly told we're behind a trusted reverse proxy
// (TRUST_PROXY=1). Otherwise IP-keyed limits collapse to a single "unknown"
// bucket — deliberately conservative. The strong brute-force guarantees in this
// app are keyed by username / per-code attempt caps, which don't depend on IP.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");

/** Best-effort client IP. Only honors proxy headers when TRUST_PROXY is set. */
export function clientIp(req: Request): string {
  if (!TRUST_PROXY) return "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
