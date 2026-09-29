import { startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SearchFor } from "../registry.ts";
import { NavigationContext } from "../router.tsx";

// ── Types ──────────────────────────────────────────────────────────────────

/** Anything `new URLSearchParams(init)` accepts, plus React Router's array-valued records. */
export type URLSearchParamsInit =
  string | URLSearchParams | Array<[string, string]> | Record<string, string | string[]>;

export interface SetSearchParamsOptions {
  /** Replace the current history entry instead of pushing (React Router). */
  replace?: boolean;
  /** History state for the new entry. */
  state?: unknown;
  /** Accepted for React Router compatibility; no effect. */
  preventScrollReset?: boolean;
}

type SetSearchParams = (
  updater: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit),
  options?: SetSearchParamsOptions,
) => void;

/**
 * The hook's result. Read it as an object (`{ searchParams, setSearchParams }`)
 * or destructure it as React Router's tuple (`const [searchParams,
 * setSearchParams] = useSearchParams()`) — both work.
 */
export type SearchParamsResult<T extends Record<string, string>> = readonly [
  URLSearchParams,
  SetSearchParams,
] & {
  searchParams: URLSearchParams;
  getParam<K extends keyof T & string>(key: K): T[K] | null;
  setSearchParams: SetSearchParams;
};

/** React Router `createSearchParams()`: build URLSearchParams, expanding array values. */
export function createSearchParams(init: URLSearchParamsInit = ""): URLSearchParams {
  if (typeof init === "string" || init instanceof URLSearchParams || Array.isArray(init)) {
    return new URLSearchParams(init);
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init)) {
    if (Array.isArray(v)) for (const item of v) params.append(k, item);
    else params.append(k, v);
  }
  return params;
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
    (updater, options) => {
      const next = createSearchParams(
        typeof updater === "function" ? updater(new URLSearchParams(window.location.search)) : updater,
      );

      const newSearch = next.toString();
      const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "") + window.location.hash;

      // Update the browser URL now so reads during the transition see it.
      if (options?.replace) history.replaceState({}, "", newUrl);
      else history.pushState({}, "", newUrl);
      selfTriggerRef.current = true;
      startTransition(() => setSearchParamsState(next));

      // Trigger a loader re-run via the NavigationContext navigate so the full
      // soft-nav fetch path is exercised (meta update, module swap, etc.).
      // Always `replace` here: the entry was already written above.
      if (navCtx) {
        void navCtx.navigate(window.location.pathname + (newSearch ? "?" + newSearch : ""), {
          replace: true,
          state: options?.state,
          unblocked: true,
        });
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

  return useMemo(() => {
    // A real tuple for React Router-style destructuring, carrying the object
    // fields for BractJS-style access.
    const tuple: [URLSearchParams, SetSearchParams] = [searchParams, setSearchParams];
    const result = tuple as unknown as {
      -readonly [K in keyof SearchParamsResult<Record<string, string>>]: SearchParamsResult<
        Record<string, string>
      >[K];
    };
    result.searchParams = searchParams;
    result.getParam = getParam;
    result.setSearchParams = setSearchParams;
    return result as unknown as SearchParamsResult<Record<string, string>>;
  }, [searchParams, getParam, setSearchParams]);
}
