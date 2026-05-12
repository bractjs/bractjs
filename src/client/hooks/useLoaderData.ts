import { useContext } from "react";
import { RouterContext } from "../router.tsx";
import { BractJSContext } from "../../shared/context.ts";

/**
 * Returns the current route's loader data, typed as T.
 * Works in both SSR and client contexts.
 */
export function useLoaderData<T = unknown>(): T {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  const loaderData = router?.loaderData ?? bract?.loaderData ?? {};
  return loaderData.route as T;
}
