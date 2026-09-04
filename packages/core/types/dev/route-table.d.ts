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
