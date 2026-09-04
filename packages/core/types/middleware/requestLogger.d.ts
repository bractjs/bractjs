import type { MiddlewareFn } from "../server/middleware.ts";
/**
 * Logs "[METHOD] /path → status in Xms" for every request.
 */
export declare function requestLogger(): MiddlewareFn;
