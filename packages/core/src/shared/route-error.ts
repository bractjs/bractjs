import { type ComponentType, createContext, createElement, type ReactElement, useContext } from "react";
import { HttpError } from "./errors.ts";

// A route loader that fails leaves `{ __error: { message, status? } }` in its
// loader slot (server/loader.ts) instead of aborting the page, so root still
// renders. Both the server render and the client <Outlet> turn that slot into
// an ErrorBoundary in the route's place — with the SAME component on each side,
// so hydration matches.

type ErrorBoundaryComponent = ComponentType<{ error: unknown }>;

/** The error a failed route loader left in its slot, or null. */
export function routeLoaderError(slot: unknown): Error | null {
  if (!slot || typeof slot !== "object" || !("__error" in slot)) return null;
  const e = ((slot as { __error?: { message?: string; status?: number } }).__error ?? {}) as {
    message?: string;
    status?: number;
  };
  const message = e.message ?? "Internal Server Error";
  return e.status ? new HttpError(e.status, message) : new Error(message);
}

/** The HTTP status a route-loader error should produce. */
export function routeErrorStatus(error: Error): number {
  return error instanceof HttpError ? error.status : 500;
}

/**
 * Built-in fallback when neither the route nor root exports an ErrorBoundary.
 * Renders only the (already sanitized) message and status, identically on
 * server and client.
 */
export function RouteErrorFallback({ error }: { error: unknown }): ReactElement {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  return createElement(
    "div",
    { role: "alert", "data-bract-error": status },
    createElement("h1", null, String(status)),
    createElement("p", null, message),
  );
}

/** Nearest ErrorBoundary: the route's, else root's, else the built-in fallback. */
export function pickErrorBoundary(
  route: ErrorBoundaryComponent | undefined,
  root: ErrorBoundaryComponent | undefined,
): ErrorBoundaryComponent {
  return route ?? root ?? RouteErrorFallback;
}

// ── useRouteError ──────────────────────────────────────────────────────────

/** The error the nearest rendering ErrorBoundary is showing (null outside one). */
export const RouteErrorContext = createContext<unknown>(null);

/**
 * React Router's `useRouteError()`: the error the enclosing `ErrorBoundary` is
 * rendering. BractJS also passes it as the `error` prop — use either. Returns
 * `undefined` outside an ErrorBoundary.
 */
export function useRouteError(): unknown {
  return useContext(RouteErrorContext) ?? undefined;
}

/**
 * Render an ErrorBoundary component for `error`: as the `error` prop (BractJS)
 * AND via context (`useRouteError()`), plus React Router's `params` /
 * `loaderData` props when known. Every boundary render site goes through here
 * so server and client produce the same tree.
 */
export function renderErrorBoundary(
  Boundary: ComponentType<{ error: unknown }>,
  error: unknown,
  extra?: { params?: Record<string, string>; loaderData?: unknown },
): ReactElement {
  return createElement(
    RouteErrorContext.Provider,
    { value: error },
    createElement(Boundary as ComponentType<Record<string, unknown>>, { error, ...extra }),
  );
}
