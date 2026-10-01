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
export declare function requestLogger(options?: RequestLoggerOptions): MiddlewareFn;
