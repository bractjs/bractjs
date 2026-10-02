import { getRequestId } from "../server/request-context.ts";
import type { MiddlewareFn } from "../server/middleware.ts";

export interface RequestLoggerOptions {
  /**
   * `"text"` (default): `[GET] /posts → 200 in 12ms`, with `[id]` prepended
   * when requestId() runs. `"json"`: one JSON object per line —
   * `{ time, level, method, path, status, ms, requestId }` — for log shippers.
   */
  format?: "text" | "json";
  /** Where lines go. Default `console.log`. */
  write?: (line: string) => void;
}

/**
 * Logs one line per request: method, path, status and duration (plus the
 * request id when the requestId() middleware runs before it).
 */
// SECURITY(medium): only the pathname is logged — query string is intentionally
// omitted because it may carry tokens (e.g. password-reset links, OAuth codes,
// signed share URLs). Do not extend this to log searchParams without a redaction
// allowlist.
export function requestLogger(options: RequestLoggerOptions = {}): MiddlewareFn {
  const format = options.format ?? "text";
  const write = options.write ?? ((line: string) => console.log(line));
  return async (ctx, next) => {
    const start = performance.now();
    const { pathname } = new URL(ctx.request.url);
    const response = await next();
    const ms = Math.round(performance.now() - start);
    const id = getRequestId();
    if (format === "json") {
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level: response.status >= 500 ? "error" : "info",
          method: ctx.request.method,
          path: pathname,
          status: response.status,
          ms,
          ...(id ? { requestId: id } : {}),
        }),
      );
    } else {
      write(`${id ? `[${id}] ` : ""}[${ctx.request.method}] ${pathname} → ${response.status} in ${ms}ms`);
    }
    return response;
  };
}
