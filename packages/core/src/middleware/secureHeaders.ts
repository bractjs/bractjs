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
export function secureHeaders(options: SecureHeadersOptions = {}): MiddlewareFn {
  const fixed: Array<[string, string | false | undefined]> = [
    [
      "Permissions-Policy",
      options.permissionsPolicy ?? "camera=(), microphone=(), geolocation=(), payment=()",
    ],
    ["Cross-Origin-Opener-Policy", options.crossOriginOpenerPolicy ?? "same-origin"],
    ["Cross-Origin-Resource-Policy", options.crossOriginResourcePolicy ?? "same-site"],
    ["X-Frame-Options", options.frameOptions ?? "SAMEORIGIN"],
    ["Referrer-Policy", options.referrerPolicy ?? "strict-origin-when-cross-origin"],
    ["X-Content-Type-Options", options.noSniff === false ? false : "nosniff"],
  ];
  const hsts = options.hsts ?? "max-age=15552000; includeSubDomains";
  return async (ctx, next) => {
    const res = await next();
    const headers: Array<[string, string]> = [];
    for (const [name, value] of fixed) if (value) headers.push([name, value]);
    if (hsts && isHttps(ctx.request)) headers.push(["Strict-Transport-Security", hsts]);
    const missing = headers.filter(([name]) => !res.headers.has(name));
    if (missing.length === 0) return res;
    try {
      for (const [name, value] of missing) res.headers.set(name, value);
      return res;
    } catch {
      // Immutable headers (e.g. a Response passed through from fetch()).
      const copy = new Response(res.body, res);
      for (const [name, value] of missing) copy.headers.set(name, value);
      return copy;
    }
  };
}

function isHttps(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim() === "https";
}
