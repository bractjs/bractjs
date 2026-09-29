import type { RouteContext } from "../shared/router-context.ts";
/** What `call()` resolves to inside an instrumentation wrapper. */
export type InstrumentResult = {
    status: "success";
    error: undefined;
} | {
    status: "error";
    error: unknown;
};
/** Runs the wrapped operation. Always resolves; call it at most once. */
export type InstrumentCall = () => Promise<InstrumentResult>;
export interface InstrumentRequestInfo {
    request: Request;
    context: RouteContext;
}
export interface InstrumentRouteInfo {
    request: Request;
    params: Record<string, string>;
    context: RouteContext;
    /** appDir-relative module id ("root.tsx", "routes/blog/[id].tsx"). */
    id: string;
    /** The matched URL pattern, e.g. `/blog/:id` (React Router's `unstable_pattern`). */
    pattern?: string;
}
type Wrapper<I> = (call: InstrumentCall, info: I) => unknown;
/** The route-level operations an instrumentation can wrap. */
export interface RouteInstrumentations {
    loader?: Wrapper<InstrumentRouteInfo>;
    action?: Wrapper<InstrumentRouteInfo>;
    middleware?: Wrapper<InstrumentRouteInfo>;
}
/** The request-level operations an instrumentation can wrap. */
export interface HandlerInstrumentations {
    request?: Wrapper<InstrumentRequestInfo>;
}
/**
 * One instrumentation. Two equivalent shapes:
 *
 * - **Flat** (BractJS): `{ request, loader, action, middleware }` — applied to
 *   every request / every route.
 * - **React Router 8**: `{ handler(h) { h.instrument({ request }) }, route(r) {
 *   r.instrument({ loader, action, middleware }) } }` — `route()` is called once
 *   per route module (with `r.id`), so it can instrument selectively.
 */
export interface Instrumentation extends HandlerInstrumentations, RouteInstrumentations {
    handler?: (handler: {
        instrument(i: HandlerInstrumentations): void;
    }) => void;
    route?: (route: {
        id: string;
        instrument(i: RouteInstrumentations): void;
    }) => void;
}
/**
 * Register instrumentations. Call from `app/server.ts` (runs in dev, `start`,
 * and the compiled binary) or list them in `app/lifecycle.ts` as
 * `instrumentations: [...]`. Returns an unregister function.
 *
 * ```ts
 * instrument({
 *   async loader(call, { id, request }) {
 *     const t = performance.now();
 *     const { status } = await call();
 *     console.log(id, status, performance.now() - t, "ms");
 *   },
 * });
 * ```
 */
export declare function instrument(...instrumentations: Instrumentation[]): () => void;
/** Remove every registered instrumentation (tests, hot reload). */
export declare function clearInstrumentations(): void;
/** True when anything is registered — lets hot paths skip all wrapping. */
export declare function hasInstrumentations(): boolean;
/** Wrap one whole request (after the dev-host guard, around global middleware). */
export declare function instrumentRequest(info: InstrumentRequestInfo, fn: () => Promise<Response>): Promise<Response>;
/** Wrap one route-level operation for the module `info.id`. */
export declare function instrumentRoute<T>(kind: keyof RouteInstrumentations, info: InstrumentRouteInfo, fn: () => Promise<T>): Promise<T>;
export {};
