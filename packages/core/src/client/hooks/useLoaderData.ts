import { useContext } from "react";
import { BractJSContext, LoaderSliceContext } from "../../shared/context.ts";
import type { LoaderData } from "../../shared/route-types.ts";
import { RouterContext } from "../router.tsx";

/**
 * Returns the current route's loader data — or, inside a layout.tsx component,
 * that layout's own loader data. Works in both SSR and client contexts.
 *
 * Prefer passing the loader function type — `useLoaderData<typeof loader>()` —
 * so the data type is inferred from the loader's return (no hand-written type to
 * keep in sync). An explicit object type still works: `useLoaderData<HomeData>()`.
 */
export function useLoaderData<T = unknown>(): LoaderData<T> {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  const slice = useContext(LoaderSliceContext);
  const loaderData = router?.loaderData ?? bract?.loaderData ?? {};
  // Inside a layout component (or its children above the next <Outlet>), the
  // layout's own loader data; everywhere else, the route's.
  if (slice !== null) return (loaderData.layouts as unknown[] | undefined)?.[slice] as LoaderData<T>;
  return loaderData.route as LoaderData<T>;
}
