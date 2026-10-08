/**
 * Percent-decode a request pathname for a filesystem lookup. `null` for a
 * malformed escape or an embedded NUL (never a legitimate file name). Callers
 * run every traversal guard on the DECODED value.
 */
export declare function decodePathname(pathname: string): string | null;
export declare function serveStatic(rawPathname: string, buildDir: string, publicDir: string): Promise<Response | null>;
