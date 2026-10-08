// Small React Router hooks with a direct BractJS equivalent — here so ported
// components keep compiling and behaving.

import { useContext } from "react";
import { type PathObject, parseTo } from "../nav-utils.ts";
import { RouterContext } from "../router.tsx";
import { useLocation } from "./useLocation.ts";
import { type RelativeRoutingType, useResolveTo } from "./useResolveTo.ts";

/**
 * React Router's `useResolvedPath(to, { relative })`: `to` resolved against
 * the route this component renders under (`relative: "path"`: against the
 * URL's segments), as `{ pathname, search, hash }`. SSR-safe.
 */
export function useResolvedPath(
  to: string | Partial<PathObject>,
  options?: { relative?: RelativeRoutingType },
): PathObject {
  const resolve = useResolveTo();
  return parseTo(resolve(to, options?.relative));
}

/** React Router's `useHref(to, { relative })`: the resolved URL string for `to`. */
export function useHref(
  to: string | Partial<PathObject>,
  options?: { relative?: RelativeRoutingType },
): string {
  const p = useResolvedPath(to, options);
  return p.pathname + p.search + p.hash;
}

/**
 * React Router's `useFormAction(action?, { relative })`: the URL a `<Form>`
 * posts to — `action` resolved like a link, or (no action) the current URL:
 * only the page's own route runs actions, so the default is always the page.
 */
export function useFormAction(action?: string, options?: { relative?: RelativeRoutingType }): string {
  const location = useLocation();
  const resolve = useResolveTo();
  if (action === undefined) return location.pathname + location.search;
  return resolve(action, options?.relative);
}

/**
 * React Router's `useNavigationType()`: how the current location was reached —
 * `"PUSH"`, `"REPLACE"`, or `"POP"` (initial load and back/forward).
 */
export function useNavigationType(): "POP" | "PUSH" | "REPLACE" {
  return useContext(RouterContext)?.navigationType ?? "POP";
}
