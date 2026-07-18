import { type AnchorHTMLAttributes, type ReactNode } from "react";
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
    to: TTo | (string & {});
    /** Path params for a dynamic `to` (e.g. `params={{ id }}` for `/blog/:id`). */
    params?: ParamsFor<TTo>;
    /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
    search?: Partial<SearchOutputFor<TTo>>;
    prefetch?: PrefetchMode;
    /** Opt in to View Transitions API for this navigation (E1). */
    viewTransition?: boolean;
    /** Replace the current history entry instead of pushing. */
    replace?: boolean;
    children: ReactNode;
};
export declare function Link<TTo extends RegisteredRoutes = RegisteredRoutes>({ to, params, search, prefetch, viewTransition, replace, children, ...rest }: LinkProps<TTo>): import("react").JSX.Element;
export {};
