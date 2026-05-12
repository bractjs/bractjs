import type { MiddlewareFn } from "../server/middleware.ts";

/**
 * Logs "[METHOD] /path → status in Xms" for every request.
 */
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
