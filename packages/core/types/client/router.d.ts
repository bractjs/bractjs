import { type ComponentType } from "react";
import type { ServerManifest } from "../server/render.ts";
import type { RouteMatch, RouterLocation } from "../shared/route-types.ts";
export interface RouteModuleClient {
    default?: ComponentType;
    ErrorBoundary?: ComponentType<{
        error: Error;
    }>;
    /** SSR'd placeholder for selective-SSR routes (`ssr: false` / `"data-only"`). */
    Fallback?: ComponentType;
    /** Browser-side loader (RR7-style). Runs on navigation instead of just fetching /_data. */
    clientLoader?: import("../shared/route-types.ts").ClientLoaderFunction;
    /** Browser-side action (RR7-style). Runs on submit instead of POSTing directly. */
    clientAction?: import("../shared/route-types.ts").ClientActionFunction;
}
/**
 * Truthy while the initial client render must keep showing what the server
 * sent instead of the real route component: the Fallback for selective-SSR
 * documents, nothing for the SPA shell. Cleared (→ `false`) once loader data
 * is in place.
 */
export type HydrationPending = false | "client-only" | "data-only" | "spa";
export interface RouteState {
    loaderData: Record<string, unknown>;
    actionData: unknown;
    params: Record<string, string>;
    /** Query-free pathname of the current route (kept alongside `location` for back-compat). */
    pathname: string;
    location: RouterLocation;
    /** Validated search params (route `searchSchema` output; raw string record otherwise). */
    search: Record<string, unknown>;
    /** The matched route chain (root → layouts → route) for `useMatches()`. */
    matches: RouteMatch[];
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
export declare const RouterContext: import("react").Context<RouterContextValue>;
export declare function useRouterContext(): RouterContextValue;
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
    submit(to: string, options: {
        method: string;
        body: FormData | Record<string, string>;
    }): Promise<void>;
}
export declare const NavigationContext: import("react").Context<NavigationContextValue>;
export declare function useNavigationContext(): NavigationContextValue;
