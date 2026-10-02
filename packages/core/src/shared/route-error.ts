import { type ComponentType, createContext, createElement, type ReactElement, useContext } from "react";
import { HttpError } from "./errors.ts";

// A loader that fails leaves `{ __error: { message, status? } }` in its loader
// slot (server/loader.ts) instead of aborting the page. The outermost failed
// slot decides what renders:
//   - route:    root and every layout render; the nearest ErrorBoundary renders
//               in the route's place.
//   - layout:   root and the layouts above it render; the nearest ErrorBoundary
//               renders in the failed layout's place.
//   - root:     nothing of the app can render (root.tsx owns <html>), so the
//               server answers with a minimal error document (server/render.ts).
// Both the server render and the client <Outlet> make these choices through the
// helpers below — with the SAME component on each side, so hydration matches.

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

/** Where the outermost failed loader sits, and its error. */
export type LoaderFailure =
  | { scope: "root"; error: Error }
  | { scope: "layout"; index: number; error: Error }
  | { scope: "route"; error: Error };

/**
 * The outermost loader slot that failed — root, then layouts (outermost
 * first), then the route — or null when every loader succeeded.
 */
export function firstLoaderFailure(
  loaderData: { root?: unknown; layouts?: readonly unknown[]; route?: unknown } | null | undefined,
): LoaderFailure | null {
  if (!loaderData) return null;
  const rootError = routeLoaderError(loaderData.root);
  if (rootError) return { scope: "root", error: rootError };
  const layouts = loaderData.layouts ?? [];
  for (let index = 0; index < layouts.length; index++) {
    const error = routeLoaderError(layouts[index]);
    if (error) return { scope: "layout", index, error };
  }
  const routeError = routeLoaderError(loaderData.route);
  return routeError ? { scope: "route", error: routeError } : null;
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

/**
 * Nearest ErrorBoundary, innermost first: the failed module's own, then each
 * enclosing layout's (innermost first), then root's — else the built-in fallback.
 */
export function pickErrorBoundary(
  ...candidates: Array<ErrorBoundaryComponent | undefined>
): ErrorBoundaryComponent {
  return candidates.find((c) => c !== undefined) ?? RouteErrorFallback;
}

/**
 * The ErrorBoundary for a failure at `failedIndex` in `layouts` (or at the
 * route when `failedIndex === layouts.length`): the failed module's own
 * boundary, then enclosing layouts' innermost first, then root's.
 */
export function pickBoundaryForFailure(
  own: ErrorBoundaryComponent | undefined,
  // `unknown`: layout modules type their boundary's props variously.
  layouts: ReadonlyArray<{ ErrorBoundary?: unknown } | null | undefined>,
  failedIndex: number,
  root: ErrorBoundaryComponent | undefined,
): ErrorBoundaryComponent {
  const enclosing = layouts
    .slice(0, failedIndex)
    .map((m) => m?.ErrorBoundary as ErrorBoundaryComponent | undefined)
    .reverse();
  return pickErrorBoundary(own, ...enclosing, root);
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
