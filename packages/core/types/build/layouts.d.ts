import { type RouteFile } from "../server/scanner.ts";
/**
 * Each route's layout files, appDir-relative (`routes/blog/layout.tsx`),
 * outermost → innermost. Mirrors the server's resolveLayoutChain: per
 * directory, `layout.tsx` wins over `layout.ts`.
 */
export declare function routeLayoutFiles(appDir: string, routes: RouteFile[]): Promise<Map<string, string[]>>;
/** The expected output path (relative to the client outdir) of an appDir-relative source file. */
export declare function outputRelPath(appDirClean: string, sourceRel: string): string;
/**
 * Attach layout chunks to each route, and put layout CSS ahead of the route's
 * own so the route wins the cascade. Mutates `routeCss`; returns the
 * pattern → layout chunk URLs map for the manifest.
 */
export declare function attachLayouts(layoutFilesByPattern: Map<string, string[]>, layoutChunks: Map<string, string>, layoutCss: Map<string, string[]>, routeCss: Map<string, string[]>): Map<string, string[]>;
