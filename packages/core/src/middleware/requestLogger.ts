import type { MiddlewareFn } from "../server/middleware.ts";

/**
 * Logs "[METHOD] /path → status in Xms" for every request.
 */
// SECURITY(medium): only the pathname is logged — query string is intentionally
// omitted because it may carry tokens (e.g. password-reset links, OAuth codes,
// signed share URLs). Do not extend this to log searchParams without a redaction
// allowlist.
export function requestLogger(): MiddlewareFn {
  return async (ctx, next) => {
    const start = Date.now();
    const { pathname } = new URL(ctx.request.url);
    const response = await next();
    const ms = Date.now() - start;
    console.log(`[${ctx.request.method}] ${pathname} → ${response.status} in ${ms}ms`);
    return response;
  };
}
