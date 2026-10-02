import type { MiddlewareFn } from "../server/middleware.ts";
export interface RequestIdOptions {
    /** Header to read an incoming id from and to echo on the response. Default `X-Request-Id`. */
    header?: string;
    /** Make a new id. Default `crypto.randomUUID()`. */
    generate?: () => string;
    /**
     * Reuse an id the client or a proxy sent in `header` (load balancers set
     * one so logs line up across hops). Only ids of 1–128 characters from
     * `[A-Za-z0-9._:-]` are accepted, so a header can't inject into logs.
     * Default true.
     */
    trustIncoming?: boolean;
}
/**
 * Give every request an id: reused from an incoming `X-Request-Id` when it's
 * safe, otherwise generated. It is echoed on the response, readable anywhere
 * in the request with `getRequestId()`, included by `requestLogger()`, and
 * shown by the built-in error pages so users can quote it. Register it first:
 *
 * ```ts
 * pipeline.use(requestId());
 * pipeline.use(requestLogger());
 * ```
 */
export declare function requestId(options?: RequestIdOptions): MiddlewareFn;
