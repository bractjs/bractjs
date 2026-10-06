import { isExplicitDev } from "./env.ts";

/** Seconds, or a number with a unit: `"30s"`, `"5m"`, `"1h"`, `"7d"`. */
export type CacheDuration = number | `${number}${"s" | "m" | "h" | "d"}`;

export interface CacheOptions {
  /** How long a browser (and, without `sMaxAge`, a shared cache) may reuse the response. */
  maxAge?: CacheDuration;
  /** How long a shared cache (CDN, proxy) may reuse it. Overrides `maxAge` there. */
  sMaxAge?: CacheDuration;
  /** After it goes stale: how long a cache may keep serving it while refreshing in the background. */
  staleWhileRevalidate?: CacheDuration;
  /** After it goes stale: how long a cache may serve it when refreshing fails. */
  staleIfError?: CacheDuration;
  /** Only the user's browser may cache it, never a CDN. Set this for anything per-user. */
  private?: boolean;
  /** Shared caches may store it even where they otherwise wouldn't (e.g. with `Authorization`). */
  public?: boolean;
  /** Store it, but revalidate with the server before every reuse. */
  noCache?: boolean;
  /** Never store it anywhere. Wins over every other option. */
  noStore?: boolean;
  /** Once stale, never serve it without revalidating (disables stale serving). */
  mustRevalidate?: boolean;
  /** The body never changes for this URL (hashed assets): skip revalidation entirely. */
  immutable?: boolean;
}

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

function seconds(value: CacheDuration, option: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`[bractjs] cache(): ${option} must be a non-negative number of seconds`);
    }
    return Math.floor(value);
  }
  const m = /^(\d+(?:\.\d+)?)([smhd])$/.exec(value);
  if (!m)
    throw new RangeError(
      `[bractjs] cache(): ${option} "${value}" — use seconds, or "30s" / "5m" / "1h" / "7d"`,
    );
  return Math.floor(Number(m[1]) * UNIT_SECONDS[m[2] as keyof typeof UNIT_SECONDS]);
}

/** The `Cache-Control` value for `options`. */
export function cacheControl(options: CacheOptions): string {
  if (options.noStore) return "no-store";
  if (options.private && options.public) {
    throw new TypeError("[bractjs] cache(): `private` and `public` contradict each other");
  }
  const out: string[] = [];
  if (options.private) out.push("private");
  if (options.public) out.push("public");
  if (options.noCache) out.push("no-cache");
  if (options.maxAge !== undefined) out.push(`max-age=${seconds(options.maxAge, "maxAge")}`);
  if (options.sMaxAge !== undefined) {
    if (options.private) throw new TypeError("[bractjs] cache(): `sMaxAge` has no effect with `private`");
    out.push(`s-maxage=${seconds(options.sMaxAge, "sMaxAge")}`);
  }
  if (options.staleWhileRevalidate !== undefined) {
    out.push(`stale-while-revalidate=${seconds(options.staleWhileRevalidate, "staleWhileRevalidate")}`);
  }
  if (options.staleIfError !== undefined) {
    out.push(`stale-if-error=${seconds(options.staleIfError, "staleIfError")}`);
  }
  if (options.mustRevalidate) out.push("must-revalidate");
  if (options.immutable) out.push("immutable");
  if (out.length === 0) throw new TypeError("[bractjs] cache(): pass at least one option");
  return out.join(", ");
}

/**
 * A `Cache-Control` header, ready to return from a route's `headers()`, pass
 * to `data(value, { headers })` or `json()`, or spread into a `Response`:
 *
 *   export const headers = () => cache({ maxAge: "1m", sMaxAge: "1h", staleWhileRevalidate: "1d" });
 */
export function cache(options: CacheOptions): { "Cache-Control": string } {
  return { "Cache-Control": cacheControl(options) };
}

type Directives = Map<string, number | true>;

function parse(value: string): Directives {
  const out: Directives = new Map();
  for (const part of value.split(",")) {
    const [rawKey, rawValue] = part.trim().split("=", 2);
    const key = rawKey?.trim().toLowerCase();
    if (!key) continue;
    const n = rawValue === undefined ? NaN : Number(rawValue.trim().replace(/^"|"$/g, ""));
    out.set(key, Number.isFinite(n) ? n : true);
  }
  return out;
}

const AGES = ["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error"];

/**
 * Combine `Cache-Control` values so the result is no more cacheable than any
 * of them: `no-store` beats everything, then `private`, `no-cache`, and
 * `must-revalidate` carry over; each age is the smallest one given (an age
 * one value leaves out is dropped, so it can't outlive that value); `public`
 * and `immutable` survive only when every value has them. Empty values are
 * ignored. Use it in a layout or route `headers()` to keep a parent's limit:
 *
 *   export const headers = ({ parentHeaders }) => ({
 *     "Cache-Control": mergeCacheControl(parentHeaders.get("Cache-Control"), "public, max-age=3600"),
 *   });
 */
export function mergeCacheControl(...values: Array<string | null | undefined>): string {
  const all = values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map(parse);
  if (all.length === 0) return "";
  if (all.some((d) => d.has("no-store"))) return "no-store";
  const out: string[] = [];
  const isPrivate = all.some((d) => d.has("private"));
  if (isPrivate) out.push("private");
  else if (all.every((d) => d.has("public"))) out.push("public");
  if (all.some((d) => d.has("no-cache"))) out.push("no-cache");
  for (const age of AGES) {
    if (age === "s-maxage" && isPrivate) continue;
    const given = all.map((d) => d.get(age));
    if (given.some((v) => typeof v !== "number")) continue;
    out.push(`${age}=${Math.min(...(given as number[]))}`);
  }
  if (all.some((d) => d.has("must-revalidate"))) out.push("must-revalidate");
  if (all.every((d) => d.has("immutable"))) out.push("immutable");
  return out.join(", ");
}

const warned = new Set<string>();

/**
 * SECURITY(medium): a response that sets a cookie must never be stored by a
 * shared cache — a CDN would replay one visitor's session cookie to everyone.
 * When `Set-Cookie` meets `public` or `s-maxage`, rewrite `Cache-Control` to
 * `private` (dropping `s-maxage`), and say so once per path in development.
 * Applied to every response, after global middleware.
 */
export function privateWhenSettingCookies(res: Response, request: Request): Response {
  if (!res.headers.has("Set-Cookie")) return res;
  const cc = res.headers.get("Cache-Control");
  if (!cc) return res;
  const d = parse(cc);
  if (!d.has("public") && !d.has("s-maxage")) return res;
  d.delete("public");
  d.delete("s-maxage");
  d.set("private", true);
  const rewritten = [
    "private",
    ...[...d].filter(([k]) => k !== "private").map(([k, v]) => (v === true ? k : `${k}=${v}`)),
  ].join(", ");
  if (isExplicitDev()) {
    const path = new URL(request.url).pathname;
    if (!warned.has(path)) {
      warned.add(path);
      console.warn(
        `[bractjs] ${path}: the response sets a cookie, so "Cache-Control: ${cc}" became "${rewritten}" ` +
          "— a shared cache must not store a Set-Cookie response.",
      );
    }
  }
  try {
    res.headers.set("Cache-Control", rewritten);
    return res;
  } catch {
    // Immutable headers (e.g. a Response from fetch()): copy them.
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", rewritten);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}
