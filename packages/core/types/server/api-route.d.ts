import { type MiddlewareContext, type MiddlewareFn } from "./middleware.ts";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface ApiRouteOptions {
    /**
     * Cross-site-request-forgery protection for this route. Default `true` for
     * mutating methods (POST/PUT/PATCH/DELETE): the request must be same-origin
     * (proven via `Sec-Fetch-Site`, the `X-BractJS-Action` header, or a matching
     * `Origin`), exactly like server actions. Set `false` ONLY for endpoints
     * that are safe to call cross-site — i.e. they do NOT rely on ambient
     * credentials (session cookies / Basic auth) and are intentionally public
     * (webhooks, token-authenticated APIs, public read/write services).
     * Only GET is exempt from the gate; DELETE is treated as mutating.
     */
    csrf?: boolean;
    /**
     * Per-endpoint middleware, run after the CSRF gate but before body parsing
     * and the handler. Same contract as global/route middleware: call `next()`
     * to continue or return a `Response` to short-circuit (auth gate, rate
     * limit). `ctx.params` holds `:param` segment values from the matched path;
     * values set on `ctx.context` are visible to the handler via its third
     * argument. This is the supported way to guard a typed endpoint — per-route
     * (nested) `middleware` exports do NOT cover `/api`.
     */
    middleware?: MiddlewareFn[];
}
export interface ApiRouteDefinition<TMethod extends HttpMethod, TPath extends string, TInput, TOutput> {
    method: TMethod;
    path: TPath;
    handler: (input: TInput, request: Request, ctx: MiddlewareContext) => TOutput | Promise<TOutput>;
    /** Resolved CSRF setting (defaults applied at registration). */
    csrf: boolean;
    /** Per-endpoint middleware chain (empty when none configured). */
    middleware: MiddlewareFn[];
    _types: {
        input: TInput;
        output: TOutput;
    };
}
declare const routeRegistry: ApiRouteDefinition<HttpMethod, string, any, any>[];
/**
 * Internal: drop every registered API route (routes register via `route()`
 * import side-effects, so tests that import fixtures need a reset). Not part
 * of the public API.
 */
export declare function clearApiRoutes(): void;
/**
 * Internal: the currently registered API routes (method + path). Consumed by
 * the dev server's unregistered-endpoint warning. Not part of the public API.
 */
export declare function listApiRoutes(): Array<{
    method: HttpMethod;
    path: string;
}>;
/**
 * Define a typed API route.
 *
 * Usage in app/api/users.ts:
 *   export const getUsers = bract.route("GET", "/api/users", async () => db.users.findAll());
 *
 * Mutating routes (POST/PUT/PATCH/DELETE) are CSRF-protected by default — the
 * request must be same-origin. Pass `{ csrf: false }` for a deliberately public,
 * credential-free endpoint (e.g. a webhook):
 *   bract.route("POST", "/api/webhook", handler, { csrf: false });
 */
export declare function route<TMethod extends HttpMethod, TPath extends string, TInput, TOutput>(method: TMethod, path: TPath, handler: (input: TInput, request: Request, ctx: MiddlewareContext) => TOutput | Promise<TOutput>, options?: ApiRouteOptions): ApiRouteDefinition<TMethod, TPath, TInput, TOutput>;
/**
 * Attempt to handle the request by matching against registered API routes.
 * Returns null if no route matches so the caller can fall through.
 */
export declare function handleApiRequest(request: Request): Promise<Response | null>;
export type AppApiRoutes = (typeof routeRegistry)[number] extends ApiRouteDefinition<infer M, infer P, infer I, infer O> ? {
    method: M;
    path: P;
    input: I;
    output: O;
} : never;
export {};
