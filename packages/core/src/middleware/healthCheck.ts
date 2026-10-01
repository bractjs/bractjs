import type { MiddlewareFn } from "../server/middleware.ts";

export interface HealthCheckOptions {
  /** The path to answer on. Default `/healthz`. */
  path?: string;
  /**
   * Extra readiness checks (database ping, queue connection…). Return or
   * resolve `true`/`undefined` for healthy, `false` or throw for unhealthy; an
   * object is included in the response body as `details`.
   */
  check?: () => unknown;
}

/**
 * Answer load-balancer / orchestrator health probes on `GET /healthz` with
 * `200 {"status":"ok"}` (or `503 {"status":"error"}` when `check` fails),
 * before any other middleware or routing runs. Register it first so auth or
 * rate limiting never blocks the probe:
 *
 * ```ts
 * pipeline.use(healthCheck({ check: () => db.ping() }));
 * ```
 *
 * The body never carries error messages — probes are often public.
 */
export function healthCheck(options: HealthCheckOptions = {}): MiddlewareFn {
  const path = options.path ?? "/healthz";
  return async (ctx, next) => {
    if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") return next();
    if (new URL(ctx.request.url).pathname !== path) return next();
    let healthy = true;
    let details: unknown;
    try {
      const result = await options.check?.();
      if (result === false) healthy = false;
      else if (result !== undefined && result !== true) details = result;
    } catch (err) {
      healthy = false;
      console.error("[bractjs] health check failed:", err);
    }
    const body = JSON.stringify({ status: healthy ? "ok" : "error", ...(details ? { details } : {}) });
    return new Response(ctx.request.method === "HEAD" ? null : body, {
      status: healthy ? 200 : 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  };
}
