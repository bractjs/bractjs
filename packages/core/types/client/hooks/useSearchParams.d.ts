import type { SearchFor } from "../registry.ts";
type SetSearchParams = (updater: Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)) => void;
export interface SearchParamsResult<T extends Record<string, string>> {
    searchParams: URLSearchParams;
    getParam<K extends keyof T & string>(key: K): T[K] | null;
    setSearchParams: SetSearchParams;
}
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
export declare function useSearchParams<TTo extends string>(): SearchParamsResult<SearchFor<TTo>>;
export declare function useSearchParams<T extends Record<string, string> = Record<string, string>>(): SearchParamsResult<T>;
export {};
