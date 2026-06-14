import { useContext, useCallback } from "react";
import { NavigationContext } from "../router.tsx";
import { buildPath } from "../build-path.ts";
import { withSearch } from "../search-serializer.ts";
import type { RegisteredRoutes, ParamsFor, SearchOutputFor } from "../registry.ts";

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
}

export interface NavigateFn {
  <TTo extends RegisteredRoutes>(
    to: TTo | (string & {}),
    options?: NavigateOptions<TTo>,
  ): Promise<void>;
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
  return useCallback<NavigateFn>(
    (to, options) => {
      const base = options?.params
        ? buildPath(to as string, options.params as Record<string, string>)
        : (to as string);
      const href = withSearch(base, options?.search as Record<string, unknown> | undefined);
      if (!navCtx) return Promise.resolve();
      return navCtx.navigate(href, { replace: options?.replace, state: options?.state });
    },
    [navCtx],
  );
}
