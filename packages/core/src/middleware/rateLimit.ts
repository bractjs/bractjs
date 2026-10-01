import { type ClientAddressOptions, getClientAddress } from "../server/client-address.ts";
import type { MiddlewareFn } from "../server/middleware.ts";

/** One counting window: how many hits so far and when it resets (epoch ms). */
export interface RateLimitWindow {
  count: number;
  resetAt: number;
}

/**
 * Where hit counts live. The default keeps them in this process's memory —
 * fine for one server; implement this over Redis (INCR + PEXPIRE) or a
 * database to share limits across several.
 */
export interface RateLimitStore {
  /** Count a hit for `key` in a fixed window of `windowMs`; return the window after counting. */
  hit(key: string, windowMs: number): RateLimitWindow | Promise<RateLimitWindow>;
  /** Forget `key` (or everything). */
  reset(key?: string): void | Promise<void>;
}

/** An in-memory fixed-window store. Expired windows are swept as it goes, so memory stays bounded. */
export function memoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, RateLimitWindow>();
  let nextSweep = 0;
  return {
    hit(key, windowMs) {
      const now = Date.now();
      if (now >= nextSweep) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        nextSweep = now + windowMs;
      }
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return { ...fresh };
      }
      current.count += 1;
      return { ...current };
    },
    reset(key) {
      if (key === undefined) windows.clear();
      else windows.delete(key);
    },
  };
}

export interface RateLimiterOptions {
  /** Hits allowed per key per window. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
  /** Default: a new {@link memoryRateLimitStore}. */
  store?: RateLimitStore;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** ms until the window resets (0 when `ok`). */
  retryAfterMs: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Count a hit for `key` and say whether it is within the limit. */
  check(key: string): Promise<RateLimitResult>;
  reset(key?: string): Promise<void>;
}

/**
 * A fixed-window limiter for app code — per username, per email, per API key:
 *
 * ```ts
 * const loginAttempts = createRateLimiter({ max: 10, windowMs: 15 * 60_000 });
 * const { ok } = await loginAttempts.check(username);
 * if (!ok) return { error: "Too many attempts. Try again later." };
 * ```
 *
 * For a per-client limit on whole routes, use the {@link rateLimit} middleware.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { max, windowMs } = options;
  const store = options.store ?? memoryRateLimitStore();
  return {
    async check(key) {
      const w = await store.hit(key, windowMs);
      const ok = w.count <= max;
      return {
        ok,
        limit: max,
        remaining: Math.max(0, max - w.count),
        retryAfterMs: ok ? 0 : Math.max(0, w.resetAt - Date.now()),
        resetAt: w.resetAt,
      };
    },
    async reset(key) {
      await store.reset(key);
    },
  };
}

export interface RateLimitOptions extends RateLimiterOptions, ClientAddressOptions {
  /**
   * The bucket a request counts against. Default: the client's IP address
   * (`getClientAddress`, honoring `trustProxy`). Return `undefined` to not
   * limit that request.
   */
  key?: (request: Request) => string | undefined | Promise<string | undefined>;
  /** Only limit matching requests, e.g. `(r) => r.method === "POST"`. Default: all. */
  match?: (request: Request) => boolean;
}

/**
 * Limit requests per client: past `max` hits in `windowMs`, answer `429 Too
 * Many Requests` with `Retry-After`. Every limited response carries
 * `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`.
 *
 * ```ts
 * // 100 requests a minute per client to /api; trust the proxy's X-Forwarded-For.
 * pipeline.use(rateLimit({
 *   max: 100,
 *   windowMs: 60_000,
 *   trustProxy: true,
 *   match: (r) => new URL(r.url).pathname.startsWith("/api/"),
 * }));
 * ```
 *
 * When the client address is unknown (no socket address and no trusted proxy
 * header), the request is NOT limited: one shared "unknown" bucket would let
 * any single client lock everyone out.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareFn {
  const limiter = createRateLimiter(options);
  const key =
    options.key ?? ((request: Request) => getClientAddress(request, { trustProxy: options.trustProxy }));
  return async (ctx, next) => {
    if (options.match && !options.match(ctx.request)) return next();
    const bucket = await key(ctx.request);
    if (bucket === undefined) return next();
    const result = await limiter.check(bucket);
    const rateHeaders: Record<string, string> = {
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": String(result.remaining),
      "RateLimit-Reset": String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
    };
    if (!result.ok) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          ...rateHeaders,
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
    const res = await next();
    try {
      for (const [name, value] of Object.entries(rateHeaders)) res.headers.set(name, value);
      return res;
    } catch {
      const copy = new Response(res.body, res);
      for (const [name, value] of Object.entries(rateHeaders)) copy.headers.set(name, value);
      return copy;
    }
  };
}
