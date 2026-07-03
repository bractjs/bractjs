import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import type { LoaderData } from "../../shared/route-types.ts";
import { RouterContext } from "../router.tsx";

/**
 * Returns the current route's loader data. Works in both SSR and client contexts.
 *
 * Prefer passing the loader function type — `useLoaderData<typeof loader>()` —
 * so the data type is inferred from the loader's return (no hand-written type to
 * keep in sync). An explicit object type still works: `useLoaderData<HomeData>()`.
 */
export function useLoaderData<T = unknown>(): LoaderData<T> {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  const loaderData = router?.loaderData ?? bract?.loaderData ?? {};
  return loaderData.route as LoaderData<T>;
}
