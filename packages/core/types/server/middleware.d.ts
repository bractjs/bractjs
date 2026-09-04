export interface MiddlewareContext {
    request: Request;
    params: Record<string, string>;
    context: Record<string, unknown>;
}
export type MiddlewareFn = (ctx: MiddlewareContext, next: () => Promise<Response>) => Promise<Response>;
export declare class MiddlewarePipeline {
    private fns;
    /** Register a middleware function. Returns `this` for chaining. */
    use(fn: MiddlewareFn): this;
    /** Remove all registered middleware. Useful for tests and for embedders that
     * rebuild the pipeline (e.g. on a hot reload). */
    clear(): this;
    /**
     * Compose all registered middleware into a single chain and execute it.
     * Each fn calls `next()` to invoke the next fn; the last `next()` calls `handler`.
     */
    run(ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response>;
}
/** Module-level default pipeline — attach middleware here via pipeline.use(). */
export declare const pipeline: MiddlewarePipeline;
/**
 * A route/layout/root module's `middleware` entry. Same shape as the global
 * {@link MiddlewareFn}: call `next()` to continue the chain, or return a
 * `Response` to short-circuit (auth gate, redirect). The `ctx.context` object
 * is shared and mutable — set fields on it and downstream middleware, loaders,
 * and actions see them.
 */
export type RouteMiddleware = MiddlewareFn;
/**
 * Compose a route's nested middleware chain (root → layouts → route, in that
 * order) around `handler` and run it. Mirrors {@link MiddlewarePipeline.run}
 * but for an ad-hoc, per-request list rather than the module-level pipeline.
 * An empty list calls `handler` directly (zero overhead for routes that don't
 * use middleware).
 */
export declare function runRouteMiddleware(fns: RouteMiddleware[], ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response>;
/**
 * Flatten a route chain's `middleware` exports into a single ordered list:
 * root first, then each layout outermost→innermost, then the leaf route. Each
 * module may export `middleware` as a single fn or an array; both normalize
 * here. Non-function entries are ignored defensively.
 */
export declare function collectRouteMiddleware(chain: {
    root: {
        middleware?: unknown;
    };
    layouts: Array<{
        middleware?: unknown;
    }>;
    route: {
        middleware?: unknown;
    };
}): RouteMiddleware[];
