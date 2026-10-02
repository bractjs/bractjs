import type { LoaderData } from "../../shared/route-types.ts";
import type { RegisteredRouteIds, RouteLoaderData } from "../registry.ts";
/**
 * React Router's `useRouteLoaderData(routeId)`: the loader data of any route
 * in the current match chain, by id. Ids are app-relative module paths —
 * `"root.tsx"`, `"routes/blog/layout.tsx"`, `"routes/blog/[id].tsx"` — and the
 * extension may be omitted (`"root"`, `"routes/blog/layout"`). Returns
 * `undefined` when that route isn't currently matched.
 *
 * With generated route types (`bractjs codegen`) the result is typed from
 * the id — `useRouteLoaderData("root")` is root's loader data, no generic
 * needed. Without them (or to override) pass the loader type:
 *
 * ```tsx
 * const { user } = useRouteLoaderData("root")!;
 * const { user } = useRouteLoaderData<typeof rootLoader>("root")!;
 * ```
 */
export declare function useRouteLoaderData<T = never, Id extends RegisteredRouteIds | (string & {}) = string>(routeId: Id): ([T] extends [never] ? RouteLoaderData<Id> : LoaderData<T>) | undefined;
