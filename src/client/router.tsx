import { createContext, useContext, type ComponentType } from "react";
import type { ServerManifest } from "../server/render.ts";
import type { RouterLocation } from "../shared/route-types.ts";

// ── Route module shape visible on the client ───────────────────────────────

export interface RouteModuleClient {
  default?: ComponentType;
  ErrorBoundary?: ComponentType<{ error: Error }>;
  /** SSR'd placeholder for selective-SSR routes (`ssr: false` / `"data-only"`). */
  Fallback?: ComponentType;
}

/**
 * Truthy while the initial client render must keep showing what the server
 * sent instead of the real route component: the Fallback for selective-SSR
 * documents, nothing for the SPA shell. Cleared (→ `false`) once loader data
 * is in place.
 */
export type HydrationPending = false | "client-only" | "data-only" | "spa";

// ── Router Context ─────────────────────────────────────────────────────────

export interface RouteState {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  /** Query-free pathname of the current route (kept alongside `location` for back-compat). */
  pathname: string;
  location: RouterLocation;
  /** Validated search params (route `searchSchema` output; raw string record otherwise). */
  search: Record<string, unknown>;
}

export interface RouterContextValue extends RouteState {
  manifest: ServerManifest;
  currentModule: RouteModuleClient | null;
  setRoute(state: Partial<RouteState>): void;
  /** Re-run the active route's loaders (gated by `shouldRevalidate`). */
  revalidate(): Promise<void>;
  /** "loading" while a revalidation is in flight. Distinct from the navigation state. */
  revalidationState: "idle" | "loading";
  hydrationPending: HydrationPending;
}

export const RouterContext = createContext<RouterContextValue>(null!);

export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (ctx === null) {
    throw new Error("useRouterContext must be used within a ClientRouter");
  }
  return ctx;
}

// ── Navigation Context ─────────────────────────────────────────────────────

export type NavigationState = "idle" | "loading" | "submitting";

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Arbitrary history state, readable via `useLocation().state` after the navigation. */
  state?: unknown;
}

export interface NavigationContextValue {
  state: NavigationState;
  navigate(to: string, options?: NavigateOptions): Promise<void>;
  submit(to: string, options: { method: string; body: FormData | Record<string, string> }): Promise<void>;
}

export const NavigationContext = createContext<NavigationContextValue>(null!);

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (ctx === null) {
    throw new Error("useNavigationContext must be used within a ClientRouter");
  }
  return ctx;
}
