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

/**
 * Cached documents (prerendered pages, ISR pages, the SPA shell) outlive the
 * request that rendered them, so they can't carry a real nonce. Each one is
 * rendered with its own placeholder token instead, and the server swaps that
 * token for every request's own nonce as it serves the document
 * ({@link applyCspNonce}).
 *
 * SECURITY(high): the token is random PER RENDER. A fixed, public token would
 * let any HTML injected into a cached page (a stored-XSS payload in a CMS
 * post) write `nonce="<token>"` and be handed a valid nonce at serve time — a
 * CSP bypass. Content stored before a render cannot know that render's token;
 * learning it afterwards (the raw build file is public) is harmless, because
 * the document it belongs to is already fixed. Plain `[A-Za-z0-9_]`, so HTML
 * and JSON escaping leave it untouched.
 */
export function createNoncePlaceholder(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `__BRACTJS_NONCE_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}__`;
}

// A cached document written to disk starts with the token it was rendered
// with, so the server knows which string to swap — never by pattern-matching
// the body, where injected content could plant a look-alike.
const STAMP_RE = /^<!--bractjs-nonce:(__BRACTJS_NONCE_[0-9a-f]{32}__)-->/;

/** Prefix a cached document (written to disk) with the placeholder it was rendered with. */
export function stampNoncePlaceholder(html: string, placeholder: string): string {
  return `<!--bractjs-nonce:${placeholder}-->${html}`;
}

/** A stamped document's body and placeholder; an unstamped file (an older build) has none. */
export function readNonceStamp(text: string): { body: string; placeholder?: string } {
  const m = STAMP_RE.exec(text);
  return m ? { body: text.slice(m[0].length), placeholder: m[1] } : { body: text };
}

/**
 * Put this request's nonce into a document rendered with `placeholder`.
 * Without a nonce (no `csp()` on this request) the placeholder attributes are
 * removed instead, and any other occurrence (an app's own use of the nonce)
 * becomes empty. Without a placeholder the text is returned as is.
 */
export function applyCspNonce(
  text: string,
  placeholder: string | undefined,
  nonce: string | undefined,
): string {
  if (!placeholder || !text.includes(placeholder)) return text;
  if (nonce) return text.replaceAll(placeholder, nonce);
  return text.replaceAll(` nonce="${placeholder}"`, "").replaceAll(placeholder, "");
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
    try {
      response.headers.set(headerName, policy);
      return response;
    } catch {
      // Immutable headers (Response.redirect(), a Response from fetch()): copy.
      const copy = new Response(response.body, response);
      copy.headers.set(headerName, policy);
      return copy;
    }
  };
}
