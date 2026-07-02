import { startTransition, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SearchFor } from "../registry.ts";
import { NavigationContext } from "../router.tsx";

// ── Types ──────────────────────────────────────────────────────────────────

type SetSearchParams = (
  updater: Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
) => void;

export interface SearchParamsResult<T extends Record<string, string>> {
  searchParams: URLSearchParams;
  getParam<K extends keyof T & string>(key: K): T[K] | null;
  setSearchParams: SetSearchParams;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Low-level read/write of raw `URLSearchParams` (string values only). Triggers a
 * loader re-run (soft-nav fetch) when params change.
 *
 * Prefer `useSearch()` / `useSetSearch()` when the route has a `searchSchema`:
 * those return the VALIDATED, coerced object (numbers stay numbers, defaults
 * applied) and accept typed patches. Reach for `useSearchParams` only when you
 * want raw string access or the route has no schema.
 *
 * Pass the route pattern as a generic to type the result against your codegen'd
 * routes: `useSearchParams<"/posts">()`. Augment `RouteSearchParamsMap` to give a
 * route a concrete shape (defaults to `Record<string, string>`). The pattern is
 * supplied by the caller — the framework can't infer the active route at the type
 * level. An object generic — `useSearchParams<{ page: string }>()` — also works.
 *
 * This hook is SSR-safe: on the server window is absent, so it returns empty params.
 */
// Overload 1: a route literal → search shape resolved from the registry.
export function useSearchParams<TTo extends string>(): SearchParamsResult<SearchFor<TTo>>;
// Overload 2: an explicit object shape (back-compat with the old generic form).
export function useSearchParams<
  T extends Record<string, string> = Record<string, string>,
>(): SearchParamsResult<T>;
export function useSearchParams(): SearchParamsResult<Record<string, string>> {
  const navCtx = useContext(NavigationContext);

  function readCurrent(): URLSearchParams {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }

  const [searchParams, setSearchParamsState] = useState<URLSearchParams>(readCurrent);

  // Track whether we triggered the change ourselves to avoid double re-run.
  const selfTriggerRef = useRef(false);

  // Sync when the browser's history changes (back/forward, external pushState).
  useEffect(() => {
    function onPopState() {
      setSearchParamsState(new URLSearchParams(window.location.search));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setSearchParams: SetSearchParams = useCallback(
    (updater) => {
      const next =
        typeof updater === "function"
          ? updater(new URLSearchParams(window.location.search))
          : new URLSearchParams(updater);

      const newSearch = next.toString();
      const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "") + window.location.hash;

      // Update browser URL without pushing a new history entry if only params changed.
      history.pushState({}, "", newUrl);
      selfTriggerRef.current = true;
      startTransition(() => setSearchParamsState(next));

      // Trigger a loader re-run via the NavigationContext navigate so the full
      // soft-nav fetch path is exercised (meta update, module swap, etc.).
      if (navCtx) {
        void navCtx.navigate(window.location.pathname + (newSearch ? "?" + newSearch : ""));
      }
    },
    [navCtx],
  );

  const getParam = useCallback(
    (key: string): string | null => {
      return searchParams.get(key);
    },
    [searchParams],
  );

  return { searchParams, getParam, setSearchParams };
}
