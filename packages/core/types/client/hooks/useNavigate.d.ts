import type { ParamsFor, RegisteredRoutes, SearchOutputFor } from "../registry.ts";
export interface NavigateOptions<TTo extends RegisteredRoutes = RegisteredRoutes> {
    /** Path params for a dynamic `to` (e.g. `{ params: { id } }` for `/blog/:id`). */
    params?: ParamsFor<TTo>;
    /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
    search?: Partial<SearchOutputFor<TTo>>;
    /** Replace the current history entry instead of pushing a new one. */
    replace?: boolean;
    /** Arbitrary history state, readable via `useLocation().state` after navigating. */
    state?: unknown;
}
export type NavigateFn = <TTo extends RegisteredRoutes>(to: TTo | (string & {}), options?: NavigateOptions<TTo>) => Promise<void>;
/**
 * Returns a typed `navigate(to, { params })` for programmatic soft navigation —
 * the imperative counterpart to `<Link>`. Mirrors `<Link>`'s `to`/`params` API:
 * `to` autocompletes registered routes (after `bractjs codegen`) while still
 * accepting any string, and `params` is typed per route.
 *
 * SSR-safe and safe outside a `ClientRouter`: with no NavigationContext it
 * resolves to a no-op (same guard as `<Link>`), so it never throws during render.
 */
export declare function useNavigate(): NavigateFn;
