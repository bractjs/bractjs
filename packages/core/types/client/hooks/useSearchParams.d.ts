import type { SearchFor } from "../registry.ts";
/** Anything `new URLSearchParams(init)` accepts, plus React Router's array-valued records. */
export type URLSearchParamsInit = string | URLSearchParams | Array<[string, string]> | Record<string, string | string[]>;
export interface SetSearchParamsOptions {
    /** Replace the current history entry instead of pushing (React Router). */
    replace?: boolean;
    /** History state for the new entry. */
    state?: unknown;
    /** Accepted for React Router compatibility; no effect. */
    preventScrollReset?: boolean;
}
type SetSearchParams = (updater: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit), options?: SetSearchParamsOptions) => void;
/**
 * The hook's result. Read it as an object (`{ searchParams, setSearchParams }`)
 * or destructure it as React Router's tuple (`const [searchParams,
 * setSearchParams] = useSearchParams()`) — both work.
 */
export type SearchParamsResult<T extends Record<string, string>> = readonly [
    URLSearchParams,
    SetSearchParams
] & {
    searchParams: URLSearchParams;
    getParam<K extends keyof T & string>(key: K): T[K] | null;
    setSearchParams: SetSearchParams;
};
/** React Router `createSearchParams()`: build URLSearchParams, expanding array values. */
export declare function createSearchParams(init?: URLSearchParamsInit): URLSearchParams;
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
