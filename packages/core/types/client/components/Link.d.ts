import { type AnchorHTMLAttributes, type ReactNode } from "react";
import { type PathObject } from "../nav-utils.ts";
import type { ParamsFor, RegisteredRoutes, SearchOutputFor } from "../registry.ts";
/**
 * When to prefetch the target route's chunk + loader data:
 * - `"none"` (default) — never.
 * - `"intent"` — on hover/focus, after a short delay (canceled if the pointer
 *   leaves). The best default for most links.
 * - `"hover"` — immediately on mouseenter (legacy alias of intent without the
 *   delay; kept for back-compat).
 * - `"viewport"` — when the link scrolls into view (shared
 *   IntersectionObserver). Good for lists.
 * - `"render"` — as soon as the link mounts.
 */
type PrefetchMode = "none" | "intent" | "hover" | "viewport" | "render";
type LinkProps<TTo extends RegisteredRoutes = RegisteredRoutes> = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    /** Target: a path string, or React Router's `{ pathname, search, hash }` object. */
    to: TTo | (string & {}) | Partial<PathObject>;
    /** Path params for a dynamic `to` (e.g. `params={{ id }}` for `/blog/:id`). */
    params?: ParamsFor<TTo>;
    /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
    search?: Partial<SearchOutputFor<TTo>>;
    prefetch?: PrefetchMode;
    /** Opt in to View Transitions API for this navigation (E1). */
    viewTransition?: boolean;
    /** Replace the current history entry instead of pushing. */
    replace?: boolean;
    /** History state for the new entry, readable via `useLocation().state`. */
    state?: unknown;
    /**
     * When the target's cached loader data is stale, whether to refetch it in
     * the background. Passed to the route's `shouldRevalidate` as
     * `defaultShouldRevalidate`; routes without one follow it (React Router 8).
     */
    defaultShouldRevalidate?: boolean;
    /** React Router 7 name for {@link defaultShouldRevalidate}. */
    unstable_defaultShouldRevalidate?: boolean;
    /** `true` makes the click a full document load (React Router `reloadDocument`). */
    reloadDocument?: boolean;
    /** Accepted for React Router compatibility; no effect. */
    preventScrollReset?: boolean;
    /** Accepted for React Router compatibility; no effect. */
    relative?: "route" | "path";
    /** Accepted for React Router compatibility; no effect. */
    discover?: "render" | "none";
    children: ReactNode;
};
export type { LinkProps };
export declare function Link<TTo extends RegisteredRoutes = RegisteredRoutes>({ to, params, search, prefetch, viewTransition, replace, state, defaultShouldRevalidate, unstable_defaultShouldRevalidate, reloadDocument, preventScrollReset: _preventScrollReset, relative: _relative, discover: _discover, onClick, children, ...rest }: LinkProps<TTo>): import("react").JSX.Element;
