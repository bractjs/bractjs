// Small React Router hooks with a direct BractJS equivalent — here so ported
// components keep compiling and behaving.

import { useContext } from "react";
import { type PathObject, parseTo, pathToString } from "../nav-utils.ts";
import { RouterContext } from "../router.tsx";
import { useLocation } from "./useLocation.ts";

/** Resolve `to` against a pathname the way an `<a href>` would ("edit", "../x", "?q"). */
function resolveAgainst(to: string, from: string): string {
  if (to.startsWith("/")) return to;
  try {
    const u = new URL(to, `http://x${from}`);
    return u.pathname + u.search + u.hash;
  } catch {
    return to;
  }
}

/**
 * React Router's `useResolvedPath(to)`: `to` resolved against the current
 * location, as `{ pathname, search, hash }`. SSR-safe (uses the request URL).
 */
export function useResolvedPath(to: string | Partial<PathObject>): PathObject {
  const location = useLocation();
  return parseTo(resolveAgainst(pathToString(to), location.pathname + location.search));
}

/** React Router's `useHref(to)`: the resolved URL string for `to`. */
export function useHref(to: string | Partial<PathObject>): string {
  const p = useResolvedPath(to);
  return p.pathname + p.search + p.hash;
}

/**
 * React Router's `useFormAction(action?)`: the URL a `<Form>` posts to —
 * `action` resolved against the current location, or the current URL.
 */
export function useFormAction(action?: string): string {
  const location = useLocation();
  if (action === undefined) return location.pathname + location.search;
  return resolveAgainst(action, location.pathname + location.search);
}

/**
 * React Router's `useNavigationType()`: how the current location was reached —
 * `"PUSH"`, `"REPLACE"`, or `"POP"` (initial load and back/forward).
 */
export function useNavigationType(): "POP" | "PUSH" | "REPLACE" {
  return useContext(RouterContext)?.navigationType ?? "POP";
}
