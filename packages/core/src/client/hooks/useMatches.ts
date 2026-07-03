import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import type { RouteMatch } from "../../shared/route-types.ts";
import { RouterContext } from "../router.tsx";

/**
 * Returns the matched route chain, outermost → innermost: the root, then each
 * layout, then the leaf route. Each entry exposes `{ id, pathname, params,
 * data, handle }`, where `handle` is that module's static `handle` export.
 *
 * Use it to build breadcrumbs or conditional chrome from `handle` without
 * threading props through every layout. Works in both SSR and client contexts;
 * the chain updates on soft navigation and revalidation.
 *
 * ```tsx
 * // routes/blog/[id].tsx
 * export const handle = { breadcrumb: "Post" };
 *
 * // some layout
 * const crumbs = useMatches()
 *   .filter((m) => m.handle?.breadcrumb)
 *   .map((m) => m.handle!.breadcrumb as string);
 * ```
 *
 * `handle` must be JSON-serializable — it travels in the SSR bootstrap and the
 * `/_data` soft-nav payload, the same as loader data.
 */
export function useMatches(): RouteMatch[] {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  return router?.matches ?? bract?.matches ?? [];
}
