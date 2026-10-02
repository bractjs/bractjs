import { type ComponentType, type ReactElement } from "react";
type ErrorBoundaryComponent = ComponentType<{
    error: unknown;
}>;
/** The error a failed route loader left in its slot, or null. */
export declare function routeLoaderError(slot: unknown): Error | null;
/** Where the outermost failed loader sits, and its error. */
export type LoaderFailure = {
    scope: "root";
    error: Error;
} | {
    scope: "layout";
    index: number;
    error: Error;
} | {
    scope: "route";
    error: Error;
};
/**
 * The outermost loader slot that failed — root, then layouts (outermost
 * first), then the route — or null when every loader succeeded.
 */
export declare function firstLoaderFailure(loaderData: {
    root?: unknown;
    layouts?: readonly unknown[];
    route?: unknown;
} | null | undefined): LoaderFailure | null;
/** The HTTP status a route-loader error should produce. */
export declare function routeErrorStatus(error: Error): number;
/**
 * Built-in fallback when neither the route nor root exports an ErrorBoundary.
 * Renders only the (already sanitized) message and status, identically on
 * server and client.
 */
export declare function RouteErrorFallback({ error }: {
    error: unknown;
}): ReactElement;
/**
 * Nearest ErrorBoundary, innermost first: the failed module's own, then each
 * enclosing layout's (innermost first), then root's — else the built-in fallback.
 */
export declare function pickErrorBoundary(...candidates: Array<ErrorBoundaryComponent | undefined>): ErrorBoundaryComponent;
/**
 * The ErrorBoundary for a failure at `failedIndex` in `layouts` (or at the
 * route when `failedIndex === layouts.length`): the failed module's own
 * boundary, then enclosing layouts' innermost first, then root's.
 */
export declare function pickBoundaryForFailure(own: ErrorBoundaryComponent | undefined, layouts: ReadonlyArray<{
    ErrorBoundary?: unknown;
} | null | undefined>, failedIndex: number, root: ErrorBoundaryComponent | undefined): ErrorBoundaryComponent;
/** The error the nearest rendering ErrorBoundary is showing (null outside one). */
export declare const RouteErrorContext: import("react").Context<unknown>;
/**
 * React Router's `useRouteError()`: the error the enclosing `ErrorBoundary` is
 * rendering. BractJS also passes it as the `error` prop — use either. Returns
 * `undefined` outside an ErrorBoundary.
 */
export declare function useRouteError(): unknown;
/**
 * Render an ErrorBoundary component for `error`: as the `error` prop (BractJS)
 * AND via context (`useRouteError()`), plus React Router's `params` /
 * `loaderData` props when known. Every boundary render site goes through here
 * so server and client produce the same tree.
 */
export declare function renderErrorBoundary(Boundary: ComponentType<{
    error: unknown;
}>, error: unknown, extra?: {
    params?: Record<string, string>;
    loaderData?: unknown;
}): ReactElement;
export {};
