import type { SearchOutputFor } from "../registry.ts";
/**
 * The current route's VALIDATED search params — the output of its
 * `searchSchema` export (numbers/booleans/arrays/defaults already applied),
 * or the raw string record for routes without a schema.
 *
 * Validation happens once, on the server; this hook reads the validated object
 * that rode in with the page (`__BRACTJS_DATA__`) or the last soft-nav
 * (`/_data`) — the client never re-runs the schema.
 *
 * Type it against your codegen'd routes with a route literal —
 * `useSearch<"/posts">()` → `{ page: number }` — or pass an explicit shape:
 * `useSearch<{ page: number }>()`. SSR-safe.
 */
export declare function useSearch<TTo extends string>(): SearchOutputFor<TTo>;
export declare function useSearch<T extends Record<string, unknown>>(): T;
export interface SetSearchOptions {
    /** Replace the current history entry instead of pushing a new one. */
    replace?: boolean;
}
export type SetSearchFn<T extends Record<string, unknown>> = (updater: Partial<T> | ((prev: T) => Partial<T>), options?: SetSearchOptions) => Promise<void>;
/**
 * Returns a setter that merges a patch into the current search params,
 * serializes the result back into the URL, and soft-navigates — so loaders
 * re-run and the route's `searchSchema` re-validates server-side. Set a key
 * to `undefined` to delete it.
 *
 *   const setSearch = useSetSearch<"/posts">();
 *   setSearch({ page: 2 });                       // patch
 *   setSearch((prev) => ({ page: prev.page + 1 })); // functional
 *
 * SSR-safe: without a ClientRouter it resolves to a no-op.
 */
export declare function useSetSearch<TTo extends string>(): SetSearchFn<SearchOutputFor<TTo>>;
export declare function useSetSearch<T extends Record<string, unknown>>(): SetSearchFn<T>;
