export declare const ROUTE_EXPORT_NAMES: readonly ["default", "loader", "action", "clientLoader", "clientAction", "meta", "headers", "middleware", "beforeLoad", "shouldRevalidate", "searchSchema", "ssr", "Fallback", "handle", "ErrorBoundary", "config", "loaderDeps", "context", "links", "HydrateFallback", "unstable_middleware"];
/**
 * Static lint of a route module's SOURCE (no execution). Returns human-readable
 * warning strings. Used by the dev rebuilder and the production build to catch
 * common, silent mistakes: a route that renders nothing, an export whose casing
 * doesn't match a framework export, and a Remix / React Router export BractJS
 * doesn't read (all three are otherwise ignored without a trace).
 */
/** A typed API route definition found in source: `route("GET", "/api/x", …)`. */
export interface ApiRouteDef {
    method: string;
    path: string;
}
/**
 * Statically extract typed API route definitions from a module's SOURCE (no
 * execution). Used by the dev server to warn when a defined endpoint never
 * registered — registration is an import side effect, so a `route()` call in
 * a module nothing imports silently doesn't exist.
 */
export declare function extractApiRouteDefs(src: string): ApiRouteDef[];
export declare function lintRouteModuleSource(src: string, filePath: string): string[];
