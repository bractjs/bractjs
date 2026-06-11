import { useContext, useCallback } from "react";
import { NavigationContext } from "../router.tsx";
import { buildPath } from "../build-path.ts";
import type { RegisteredRoutes, ParamsFor } from "../registry.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NavigateOptions<TTo extends RegisteredRoutes = RegisteredRoutes> {
  /** Path params for a dynamic `to` (e.g. `{ params: { id } }` for `/blog/:id`). */
  params?: ParamsFor<TTo>;
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
 *
 * Note: navigation always pushes a history entry today; a `replace` option will
 * follow once the underlying navigate contract supports it.
 */
export function useNavigate(): NavigateFn {
  const navCtx = useContext(NavigationContext);
  return useCallback<NavigateFn>(
    (to, options) => {
      const href = options?.params
        ? buildPath(to as string, options.params as Record<string, string>)
        : (to as string);
      if (!navCtx) return Promise.resolve();
      return navCtx.navigate(href);
    },
    [navCtx],
  );
}
