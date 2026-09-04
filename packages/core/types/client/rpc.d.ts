/**
 * Creates a fully-typed fetch client for BractJS API routes.
 *
 * Usage:
 *   import type { AppApiRoutes } from 'bractjs';
 *   const client = createClient<AppApiRoutes>();
 *   const users = await client['/api/users'].GET();
 *
 * The proxy builds the fetch URL from the property access chain and HTTP method,
 * so `client['/api/users'].GET()` calls `GET /api/users`.
 *
 * This is intentionally minimal (no batching, no retries) — add wrapping as needed.
 */
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type RouteOutput<TRoutes extends {
    method: string;
    path: string;
    input: unknown;
    output: unknown;
}, TMethod extends string, TPath extends string> = Extract<TRoutes, {
    method: TMethod;
    path: TPath;
}>["output"];
type RouteInput<TRoutes extends {
    method: string;
    path: string;
    input: unknown;
    output: unknown;
}, TMethod extends string, TPath extends string> = Extract<TRoutes, {
    method: TMethod;
    path: TPath;
}>["input"];
type ApiClient<TRoutes extends {
    method: string;
    path: string;
    input: unknown;
    output: unknown;
}> = {
    [TPath in TRoutes["path"]]: {
        [TMethod in Extract<TRoutes, {
            path: TPath;
        }>["method"]]: (input?: RouteInput<TRoutes, TMethod, TPath>) => Promise<UnwrapPromise<RouteOutput<TRoutes, TMethod, TPath>>>;
    };
};
export declare function createClient<TRoutes extends {
    method: string;
    path: string;
    input: unknown;
    output: unknown;
}>(baseUrl?: string): ApiClient<TRoutes>;
export {};
