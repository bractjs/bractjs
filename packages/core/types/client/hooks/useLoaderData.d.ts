import type { LoaderData } from "../../shared/route-types.ts";
/**
 * Returns the current route's loader data. Works in both SSR and client contexts.
 *
 * Prefer passing the loader function type — `useLoaderData<typeof loader>()` —
 * so the data type is inferred from the loader's return (no hand-written type to
 * keep in sync). An explicit object type still works: `useLoaderData<HomeData>()`.
 */
export declare function useLoaderData<T = unknown>(): LoaderData<T>;
