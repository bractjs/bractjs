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
    /** React Router name for `Fallback` (shown while a hydrating clientLoader runs). */
    HydrateFallback?: ComponentType;
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
    /** How the current location was reached (React Router `useNavigationType()`). */
    navigationType?: "POP" | "PUSH" | "REPLACE";
}
export interface RouterContextValue extends RouteState {
    manifest: ServerManifest;
    currentModule: RouteModuleClient | null;
    /** The current route's layout.tsx modules, outermost first (index ↔ `loaderData.layouts`). */
    currentLayouts: Array<RouteModuleClient | null>;
    setRoute(state: Partial<RouteState>): void;
    /** Re-run the active route's loaders (gated by `shouldRevalidate`). */
    revalidate(): Promise<void>;
    /** "loading" while a revalidation is in flight. Distinct from the navigation state. */
    revalidationState: "idle" | "loading";
    hydrationPending: HydrationPending;
    /** root.tsx's ErrorBoundary — the fallback when a failing route has none. */
    rootErrorBoundary?: ComponentType<{
        error: unknown;
    }>;
}
export declare const RouterContext: import("react").Context<RouterContextValue>;
export declare function useRouterContext(): RouterContextValue;
export type NavigationState = "idle" | "loading" | "submitting";
export interface NavigateOptions {
    /** Replace the current history entry instead of pushing a new one. */
    replace?: boolean;
    /** Arbitrary history state, readable via `useLocation().state` after the navigation. */
    state?: unknown;
    /**
     * Passed to the target route's `shouldRevalidate` when cached loader data
     * would be refreshed in the background (routes without one follow it).
     */
    defaultShouldRevalidate?: boolean;
}
export interface RouterSubmitOptions {
    method: string;
    body: FormData | URLSearchParams | Record<string, string> | string | null;
    /** Content-Type for string bodies (JSON / text submissions). */
    contentType?: string;
    /** Passed to routes' `shouldRevalidate` after the action (routes without one follow it). */
    defaultShouldRevalidate?: boolean;
    /** Parsed JSON payload, surfaced as `useNavigation().json`. */
    json?: unknown;
    /** Raw text payload, surfaced as `useNavigation().text`. */
    text?: string;
}
/**
 * The in-flight navigation, React Router's `useNavigation()` shape: while
 * loading, `location` is where we're going; while submitting, the `form*`
 * fields describe the submission (optimistic UI reads `formData`).
 */
export interface NavigationDetail {
    location?: RouterLocation;
    formMethod?: string;
    formAction?: string;
    formEncType?: string;
    formData?: FormData;
    json?: unknown;
    text?: string;
}
export interface NavigationContextValue {
    state: NavigationState;
    /** Details of the pending navigation/submission (empty while idle). */
    detail?: NavigationDetail;
    navigate(to: string, options?: NavigateOptions): Promise<void>;
    submit(to: string, options: RouterSubmitOptions): Promise<void>;
}
export declare const NavigationContext: import("react").Context<NavigationContextValue>;
export declare function useNavigationContext(): NavigationContextValue;
