import { type ComponentType, type ReactElement } from "react";
type ErrorBoundaryComponent = ComponentType<{
    error: unknown;
}>;
/** The error a failed route loader left in its slot, or null. */
export declare function routeLoaderError(slot: unknown): Error | null;
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
/** Nearest ErrorBoundary: the route's, else root's, else the built-in fallback. */
export declare function pickErrorBoundary(route: ErrorBoundaryComponent | undefined, root: ErrorBoundaryComponent | undefined): ErrorBoundaryComponent;
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
