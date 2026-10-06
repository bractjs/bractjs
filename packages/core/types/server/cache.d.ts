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
/** The `Cache-Control` value for `options`. */
export declare function cacheControl(options: CacheOptions): string;
/**
 * A `Cache-Control` header, ready to return from a route's `headers()`, pass
 * to `data(value, { headers })` or `json()`, or spread into a `Response`:
 *
 *   export const headers = () => cache({ maxAge: "1m", sMaxAge: "1h", staleWhileRevalidate: "1d" });
 */
export declare function cache(options: CacheOptions): {
    "Cache-Control": string;
};
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
export declare function mergeCacheControl(...values: Array<string | null | undefined>): string;
/**
 * SECURITY(medium): a response that sets a cookie must never be stored by a
 * shared cache — a CDN would replay one visitor's session cookie to everyone.
 * When `Set-Cookie` meets `public` or `s-maxage`, rewrite `Cache-Control` to
 * `private` (dropping `s-maxage`), and say so once per path in development.
 * Applied to every response, after global middleware.
 */
export declare function privateWhenSettingCookies(res: Response, request: Request): Response;
