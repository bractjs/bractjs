import type { MiddlewareFn } from "../server/middleware.ts";
export interface CorsOptions {
    origin: string | string[];
    methods?: string[];
    credentials?: boolean;
}
/**
 * Sets CORS headers. Handles OPTIONS preflight with 204.
 *
 * Never reflects the Origin header when "*" is configured — emits literal "*".
 * Refuses to combine credentials:true with "*" (browsers reject it anyway).
 * Always sets `Vary: Origin` so caches don't serve a cross-origin response to
 * the wrong site.
 */
export declare function cors(options: CorsOptions): MiddlewareFn;
