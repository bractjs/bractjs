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
export {};
