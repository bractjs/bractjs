// app/ratelimit.server.ts
//
// Throttles for the sign-in flow, on BractJS's createRateLimiter (an in-memory
// fixed window per process — pass a shared `store` if you scale out). They
// limit password attempts and the second-factor email + verify endpoints, so a
// stolen password can't be turned into unlimited code emails or brute-forced
// codes.

import {
  createRateLimiter as createFrameworkLimiter,
  getClientAddress,
  type RateLimiter,
} from "@bractjs/bractjs";

export type { RateLimiter };

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  return createFrameworkLimiter({ max: limit, windowMs });
}

// Proxy-set forwarding headers are trivially spoofable by a direct client, so we
// only trust them when explicitly told we're behind a trusted reverse proxy
// (TRUST_PROXY=1). Otherwise the IP is UNKNOWN_IP and callers SKIP their
// IP-keyed limits: behind an unconfigured proxy every visitor would share the
// proxy's address, and one shared bucket would let any anonymous client lock
// every user out (30 junk logins → nobody can sign in). The strong brute-force
// guarantees in this app are keyed by username / per-code attempt caps, which
// don't depend on IP.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");

/** Returned by clientIp() when no trustworthy client address is available. */
export const UNKNOWN_IP = "unknown";

/** Best-effort client IP. Only honors proxy headers when TRUST_PROXY is set. */
export function clientIp(req: Request): string {
  if (!TRUST_PROXY) return UNKNOWN_IP;
  return getClientAddress(req, { trustProxy: true }) ?? UNKNOWN_IP;
}

/**
 * The client address to tell attackers apart for the per-user sign-in lock:
 * the forwarded address behind a trusted proxy, else the socket address. Not
 * for the IP-only limiters (see clientIp): behind an unconfigured proxy every
 * visitor shares the proxy's address, which here only makes the per-user lock
 * coarser (≈ username-only, as before), never a global bucket.
 */
export function lockoutIp(req: Request): string {
  const address = TRUST_PROXY ? getClientAddress(req, { trustProxy: true }) : getClientAddress(req);
  return address ?? UNKNOWN_IP;
}

/**
 * Check an IP-keyed limiter — a no-op pass for UNKNOWN_IP, which would
 * otherwise be one global bucket shared by every visitor (a lockout DoS).
 */
export async function checkIpLimit(
  limiter: RateLimiter,
  ip: string,
): Promise<{ ok: boolean; retryAfterMs: number }> {
  if (ip === UNKNOWN_IP) return { ok: true, retryAfterMs: 0 };
  return limiter.check(ip);
}
