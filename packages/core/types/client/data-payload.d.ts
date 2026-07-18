import type { ClientActionFunction, ClientLoaderFunction, MetaDescriptor, RouteMatch, ShouldRevalidateFunction } from "../shared/route-types.ts";
/**
 * The typed slice of a `/_data` JSON payload that the router commits into
 * state. The payload itself is `loaderData` (slices keyed root/layouts/route)
 * plus these routing fields; `parseDataPayload` centralizes the defaults so
 * every consumer (navigation commit, SWR refetch, revalidation, SPA
 * hydration) agrees on them.
 */
export interface RouteDataPayload {
    params: Record<string, string>;
    search: Record<string, unknown>;
    meta: MetaDescriptor[];
    matches: RouteMatch[];
}
/** Extract the routing fields from a raw `/_data` JSON object, with defaults. */
export declare function parseDataPayload(data: Record<string, unknown>): RouteDataPayload;
/**
 * Typed view over a dynamically imported route-module chunk. The import gives
 * us `unknown` exports; casting through this ONE interface (instead of ad-hoc
 * `as Record<string, unknown>` at every use site) keeps the optional exports'
 * shapes in a single place. Callers must still `typeof`-guard the functions —
 * a user module can export anything under these names.
 */
export interface RouteModuleView {
    config?: {
        staleTime?: number;
        gcTime?: number;
    };
    loaderDeps?: (args: {
        searchParams: URLSearchParams;
    }) => unknown[];
    shouldRevalidate?: ShouldRevalidateFunction;
    clientLoader?: ClientLoaderFunction;
    clientAction?: ClientActionFunction;
    beforeLoad?: (args: {
        params: Record<string, string>;
        context: Record<string, unknown>;
        location: {
            pathname: string;
            search: string;
        };
    }) => Promise<Response | undefined> | Response | undefined;
}
/** Single cast point for reading optional exports off an imported route module. */
export declare function moduleView(mod: unknown): RouteModuleView | null;
