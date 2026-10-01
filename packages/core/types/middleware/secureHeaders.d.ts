import type { MiddlewareFn } from "../server/middleware.ts";
export interface SecureHeadersOptions {
    /**
     * `Strict-Transport-Security`, sent only on HTTPS requests (directly or via
     * `X-Forwarded-Proto: https`). Default `max-age=15552000; includeSubDomains`
     * (180 days). `false` to omit — e.g. while still testing HTTPS.
     */
    hsts?: string | false;
    /** `Permissions-Policy`. Default turns off camera, microphone, geolocation and payment. */
    permissionsPolicy?: string | false;
    /** `Cross-Origin-Opener-Policy`. Default `same-origin`. Use `same-origin-allow-popups` for OAuth popups. */
    crossOriginOpenerPolicy?: string | false;
    /** `Cross-Origin-Resource-Policy`. Default `same-site`. */
    crossOriginResourcePolicy?: string | false;
    /** `X-Frame-Options`. Default `SAMEORIGIN` (pair with `csp({ frameAncestors })` for finer control). */
    frameOptions?: string | false;
    /** `Referrer-Policy`. Default `strict-origin-when-cross-origin`. */
    referrerPolicy?: string | false;
    /** `X-Content-Type-Options: nosniff`. Default on. */
    noSniff?: boolean;
}
/**
 * Security headers for every response — documents, `/api`, server actions
 * and static files alike. BractJS documents already carry `nosniff`,
 * `X-Frame-Options` and `Referrer-Policy`; this adds HSTS, Permissions-Policy
 * and the cross-origin policies, and extends all of them to non-document
 * responses. Headers a handler already set are left alone. Composes with
 * `csp()`:
 *
 * ```ts
 * pipeline.use(secureHeaders());
 * pipeline.use(csp());
 * ```
 */
export declare function secureHeaders(options?: SecureHeadersOptions): MiddlewareFn;
