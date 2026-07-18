export type Segment = string | {
    param: string;
} | {
    optional: string;
} | {
    catchAll: string;
};
export interface RouteFile {
    filePath: string;
    urlPattern: string;
    segments: Segment[];
}
/** A path segment that is a route group: `(marketing)`. Contributes a layout
 *  folder but no URL segment. */
export declare function isRouteGroupSegment(seg: string): boolean;
export declare function pathToSegments(pattern: string): Segment[];
export declare function filePathToPattern(filePath: string): string;
/**
 * Ancestor directory chain (relative to `routes/`) for a route file, outermost
 * → innermost, used to locate nesting `layout.tsx` files. Derived from the FILE
 * path (not the URL pattern) so route-group folders like `(marketing)` are
 * included — their layout wraps children even though they add no URL segment.
 *
 * `routes/(marketing)/blog/[id].tsx` → `["(marketing)", "(marketing)/blog"]`.
 */
export declare function layoutDirsFromFilePath(filePath: string): string[];
export declare function scanRoutes(appDir: string): Promise<RouteFile[]>;
