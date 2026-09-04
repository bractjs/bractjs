import type { RouterLocation } from "../../shared/route-types.ts";
/**
 * The current location: `{ pathname, search, hash, state, key }`.
 *
 * Reactive on the client — re-renders on every navigation (including
 * back/forward). SSR-safe: during server rendering it reflects the request URL
 * (`hash` is always `""` there, since fragments never reach the server), so
 * components rendering `pathname`/`search` hydrate without mismatch. Never
 * reads `window.location` during render.
 */
export declare function useLocation(): RouterLocation;
