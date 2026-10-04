import { useCallback, useContext } from "react";
import { buildPath } from "../build-path.ts";
import { type PathObject, pathToString, resolveHref } from "../nav-utils.ts";
import type { ParamsFor, RegisteredRoutes, SearchOutputFor } from "../registry.ts";
import { NavigationContext } from "../router.tsx";
import { withSearch } from "../search-serializer.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NavigateOptions<TTo extends RegisteredRoutes = RegisteredRoutes> {
  /** Path params for a dynamic `to` (e.g. `{ params: { id } }` for `/blog/:id`). */
  params?: ParamsFor<TTo>;
  /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
  search?: Partial<SearchOutputFor<TTo>>;
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Arbitrary history state, readable via `useLocation().state` after navigating. */
  state?: unknown;
  /**
   * When the target's cached loader data is stale, whether to refetch it in
   * the background — passed to its `shouldRevalidate` (React Router 8).
   */
  defaultShouldRevalidate?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  preventScrollReset?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  relative?: "route" | "path";
  /** Accepted for React Router compatibility; no effect. */
  flushSync?: boolean;
  /** Animate this navigation with the View Transitions API (ignored where unsupported). */
  viewTransition?: boolean;
}

export interface NavigateFn {
  <TTo extends RegisteredRoutes>(
    to: TTo | (string & {}) | Partial<PathObject>,
    options?: NavigateOptions<TTo>,
  ): Promise<void>;
  /** React Router: move through history by `delta` entries (`navigate(-1)` = back). */
  (delta: number): Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns a typed `navigate(to, { params })` for programmatic soft navigation —
 * the imperative counterpart to `<Link>`. Mirrors `<Link>`'s `to`/`params` API:
 * `to` autocompletes registered routes (after `bractjs codegen`) while still
 * accepting any string, and `params` is typed per route.
 *
 * SSR-safe and safe outside a `ClientRouter`: with no NavigationContext it
 * resolves to a no-op (same guard as `<Link>`), so it never throws during render.
 */
export function useNavigate(): NavigateFn {
  const navCtx = useContext(NavigationContext);
  return useCallback(
    (to: string | number | Partial<PathObject>, options?: NavigateOptions) => {
      if (typeof to === "number") {
        // history.go() fires popstate, which the router turns into a load.
        if (typeof window !== "undefined") window.history.go(to);
        return Promise.resolve();
      }
      const path = pathToString(to);
      const base = options?.params ? buildPath(path, options.params as Record<string, string>) : path;
      const href = withSearch(base, options?.search as Record<string, unknown> | undefined);
      if (!navCtx) return Promise.resolve();
      return navCtx.navigate(resolveHref(href), {
        replace: options?.replace,
        state: options?.state,
        defaultShouldRevalidate: options?.defaultShouldRevalidate,
        viewTransition: options?.viewTransition,
      });
    },
    [navCtx],
  ) as NavigateFn;
}
