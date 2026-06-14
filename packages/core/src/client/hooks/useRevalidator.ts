import { useContext } from "react";
import { RouterContext } from "../router.tsx";

export interface Revalidator {
  /** Re-run the active route's loaders and commit fresh data. */
  revalidate(): Promise<void>;
  state: "idle" | "loading";
}

const noop = async (): Promise<void> => {};

/**
 * Manually revalidate the current route's loader data — for "Refresh" buttons,
 * window-focus refetching, polling, or after out-of-band mutations (e.g. a
 * WebSocket message). Respects the route's `shouldRevalidate` export.
 *
 * `state` tracks only revalidation — it does not flip during navigations
 * (that's `useNavigation()`).
 *
 * SSR-safe: without a ClientRouter it returns an idle no-op.
 */
export function useRevalidator(): Revalidator {
  const routerCtx = useContext(RouterContext);
  if (!routerCtx) return { revalidate: noop, state: "idle" };
  return { revalidate: routerCtx.revalidate, state: routerCtx.revalidationState };
}
