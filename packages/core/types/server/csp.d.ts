import type { MiddlewareFn } from "./middleware.ts";
/**
 * Context key under which the per-request CSP nonce is stored. The render
 * pipeline reads this and applies it to the inline bootstrap script + the
 * client entry module tags via `renderToReadableStream({ nonce })`, so the
 * scripts BractJS injects satisfy a strict `script-src 'nonce-…'` policy.
 */
export declare const CSP_NONCE_KEY = "__bractCspNonce";
export interface CspOptions {
    /**
     * Extra directives to merge into the default policy, keyed by directive name.
     * Values are joined with spaces. A value of `null` removes a default
     * directive entirely. Example:
     *   { "img-src": "'self' https://cdn.example", "frame-ancestors": "'none'" }
     */
    directives?: Record<string, string | null>;
    /**
     * Emit `Content-Security-Policy-Report-Only` instead of the enforcing header.
     * Useful for staging a policy before turning it on. Default: false.
     */
    reportOnly?: boolean;
    /**
     * Drop `'unsafe-inline'` from the default `style-src`. The baseline policy
     * allows inline styles for ergonomics (React inline styles, CSS-in-JS), which
     * leaves inline-style injection (CSS exfiltration / UI redress) possible.
     * Set `strict: true` for `style-src 'self'` only — you must then serve all
     * styles from same-origin stylesheets (or override `style-src` yourself with
     * a nonce/hash via `directives`). Default: false.
     */
    strict?: boolean;
}
/**
 * Read the per-request CSP nonce a `csp()` middleware stored on the context.
 * Returns undefined when no CSP middleware ran (CSP is opt-in).
 */
export declare function getCspNonce(context: Record<string, unknown>): string | undefined;
/**
 * Opt-in nonce-based Content-Security-Policy middleware.
 *
 * Generates a fresh random nonce per request, stashes it on `ctx.context` so
 * the SSR render pipeline can attach it to the scripts BractJS injects, and
 * sets the `Content-Security-Policy` response header. The default policy is a
 * sensible strict baseline; override or extend it via `options.directives`.
 *
 *   import { pipeline, csp } from "@bractjs/bractjs";
 *   pipeline.use(csp({ directives: { "img-src": "'self' data: https:" } }));
 *
 * SECURITY: only the inline bootstrap script and the client entry module —
 * the scripts BractJS itself emits — are nonced. Any inline script an app adds
 * to its own `root.tsx`/components must carry the same nonce (read it via the
 * render context) or it will be blocked, which is the point of CSP.
 */
export declare function csp(options?: CspOptions): MiddlewareFn;
