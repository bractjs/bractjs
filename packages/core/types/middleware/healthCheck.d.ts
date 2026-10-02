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
export declare function healthCheck(options?: HealthCheckOptions): MiddlewareFn;
