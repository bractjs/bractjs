import { useState, useCallback, useEffect, useRef, startTransition } from "react";
import { NavigationContext } from "../router.tsx";
import { useContext } from "react";

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
 * Reads and writes URL search params, typed per-route via generic T.
 * Triggers a loader re-run (soft-nav fetch) when params change.
 *
 * T is the route's SearchParams shape (e.g. { page: string; sort: string }).
 * This hook is SSR-safe: on the server window is absent, so it returns empty params.
 */
export function useSearchParams<T extends Record<string, string> = Record<string, string>>(): SearchParamsResult<T> {
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

  const setSearchParams: SetSearchParams = useCallback((updater) => {
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
  }, [navCtx]);

  const getParam = useCallback(<K extends keyof T & string>(key: K): T[K] | null => {
    return (searchParams.get(key) as T[K] | null);
  }, [searchParams]);

  return { searchParams, getParam, setSearchParams };
}
