export declare function buildPath(pattern: string, params: Record<string, string | number>): string;
/**
 * React Router's `generatePath()` / `href()`: fill a route pattern with params.
 * Supports `:name`, optional `:name?` (the segment is dropped when absent) and
 * a trailing splat `*` (`params["*"]`, inserted unencoded so it can span
 * segments). A missing required param throws — as in React Router.
 */
export declare function generatePath(pattern: string, params?: Record<string, string | number | null | undefined>): string;
