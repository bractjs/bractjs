import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import type { RouterLocation } from "../../shared/route-types.ts";
import { RouterContext } from "../router.tsx";

/**
 * The current location: `{ pathname, search, hash, state, key }`.
 *
 * Reactive on the client — re-renders on every navigation (including
 * back/forward). SSR-safe: during server rendering it reflects the request URL
 * (`hash` is always `""` there, since fragments never reach the server), so
 * components rendering `pathname`/`search` hydrate without mismatch. Never
 * reads `window.location` during render.
 */
export function useLocation(): RouterLocation {
  const routerCtx = useContext(RouterContext);
  const bractCtx = useContext(BractJSContext);
  if (routerCtx?.location) return routerCtx.location;
  if (bractCtx?.location) return bractCtx.location;
  return {
    pathname: bractCtx?.pathname ?? "/",
    search: "",
    hash: "",
    state: null,
    key: "default",
  };
}
