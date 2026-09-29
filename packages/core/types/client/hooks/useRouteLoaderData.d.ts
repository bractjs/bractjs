import type { LoaderData } from "../../shared/route-types.ts";
/**
 * React Router's `useRouteLoaderData(routeId)`: the loader data of any route
 * in the current match chain, by id. Ids are app-relative module paths —
 * `"root.tsx"`, `"routes/blog/layout.tsx"`, `"routes/blog/[id].tsx"` — and the
 * extension may be omitted (`"root"`, `"routes/blog/layout"`). Returns
 * `undefined` when that route isn't currently matched.
 *
 * ```tsx
 * const { user } = useRouteLoaderData<typeof rootLoader>("root")!;
 * ```
 */
export declare function useRouteLoaderData<T = unknown>(routeId: string): LoaderData<T> | undefined;
