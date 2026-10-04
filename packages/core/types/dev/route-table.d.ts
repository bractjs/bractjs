export interface RouteTableRow {
    pattern: string;
    file: string;
    hasLoader: boolean;
    hasAction: boolean;
}
/**
 * Render a compact route inventory for the dev server boot log, so a developer
 * can see at a glance what routes the app matched (and which have data/mutation
 * handlers). Pure string formatting — no I/O.
 */
export declare function formatRouteTable(rows: RouteTableRow[]): string;
export interface RouteInventory {
    rows: RouteTableRow[];
    /** Route-module lint warnings ("…exports `Loader`; did you mean `loader`?"). */
    warnings: string[];
}
/**
 * Scan `appDir`'s routes and read each module's source (no module execution):
 * the route table rows plus lint warnings. Shared by the dev boot log and
 * `bractjs routes`.
 */
export declare function collectRouteRows(appDir: string): Promise<RouteInventory>;
export interface ApiRouteRow {
    method: string;
    path: string;
    file: string;
}
/** Typed `/api` endpoints defined anywhere in `appDir` (static scan of `route("GET", "/api/…")` calls). */
export declare function collectApiRouteRows(appDir: string): Promise<ApiRouteRow[]>;
/** `bractjs routes`: pages, then typed API endpoints. */
export declare function formatApiRouteTable(rows: ApiRouteRow[]): string;
