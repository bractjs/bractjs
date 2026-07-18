import { getDevHmrPort, isDevRuntime } from "./env.ts";
import type { MiddlewareFn } from "./middleware.ts";

/**
 * Context key under which the per-request CSP nonce is stored. The render
 * pipeline reads this and applies it to the inline bootstrap script + the
 * client entry module tags via `renderToReadableStream({ nonce })`, so the
 * scripts BractJS injects satisfy a strict `script-src 'nonce-…'` policy.
 */
export const CSP_NONCE_KEY = "__bractCspNonce";

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
export function getCspNonce(context: Record<string, unknown>): string | undefined {
  const v = context[CSP_NONCE_KEY];
  return typeof v === "string" ? v : undefined;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
}

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
export function csp(options: CspOptions = {}): MiddlewareFn {
  const reportOnly = options.reportOnly === true;
  const headerName = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  return async (ctx, next) => {
    const nonce = generateNonce();
    ctx.context[CSP_NONCE_KEY] = nonce;

    const directives: Record<string, string | null> = {
      "default-src": "'self'",
      // 'strict-dynamic': trust flows through the nonce — a nonced script may
      // load the chunks it imports without each chunk carrying its own nonce.
      // NOTE: in browsers that support 'strict-dynamic', the 'self' and any
      // host/allowlist expressions in script-src are IGNORED; only the nonce
      // (and scripts it transitively loads) are trusted. 'self' is kept solely
      // as a fallback for older browsers that don't implement 'strict-dynamic'.
      "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src": options.strict ? "'self'" : "'self' 'unsafe-inline'",
      "img-src": "'self' data: blob:",
      "connect-src": "'self'",
      "base-uri": "'self'",
      // Restrict where <form> can submit so an injected form can't exfiltrate
      // to an attacker origin even if it slips past other controls.
      "form-action": "'self'",
      "frame-ancestors": "'self'",
      "object-src": "'none'",
      ...(options.directives ?? {}),
    };

    // Under `bractjs dev` the HMR client opens a websocket to
    // ws://localhost:<hmrPort> (a different port = a different origin), which
    // `connect-src 'self'` would block. Append it — including over any
    // user-supplied connect-src — so csp() can stay enabled in dev instead of
    // being conditionally skipped and never verified. (The HMR client script
    // itself is nonced via CspNonceContext, so script-src needs no allowance.)
    if (isDevRuntime() && directives["connect-src"] !== null) {
      const hmrWs = `ws://localhost:${getDevHmrPort() || 3001}`;
      const current = directives["connect-src"];
      directives["connect-src"] = current ? `${current} ${hmrWs}` : hmrWs;
    }

    const policy = Object.entries(directives)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k} ${v}`)
      .join("; ");

    const response = await next();
    // Mutate headers in place so we don't break a single-shot streaming body.
    response.headers.set(headerName, policy);
    return response;
  };
}
