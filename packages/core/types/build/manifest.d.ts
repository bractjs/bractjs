export interface RouteManifestEntry {
    chunk: string;
    pattern: string;
    /** Public paths of this route's extracted CSS bundles, linked when it renders. */
    css?: string[];
}
export interface RouteManifest {
    version: 1;
    /** "production" = produced by `bractjs build`. Absent on dev-rebuilder manifests. */
    mode?: "production";
    clientEntry: string;
    rootChunk?: string;
    /** CSS reachable from the client entry — linked on every document. */
    entryCss?: string[];
    /** CSS imported by `app/root.tsx` — linked on every document. */
    rootCss?: string[];
    routes: Record<string, RouteManifestEntry>;
}
/**
 * Build a RouteManifest from hashed output paths.
 * @param opts.clientEntry   Hashed path to main client bundle
 * @param opts.routeChunks  Map<urlPattern, hashedChunkPath>
 */
export declare function generateManifest(opts: {
    clientEntry: string;
    rootChunk?: string;
    routeChunks: Map<string, string>;
    /** Per-pattern CSS bundles, keyed like `routeChunks`. */
    routeCss?: Map<string, string[]>;
    entryCss?: string[];
    rootCss?: string[];
    mode?: "production";
}): RouteManifest;
/**
 * Write manifest to {outDir}/route-manifest.json (pretty-printed).
 */
export declare function writeManifest(manifest: RouteManifest, outDir: string): Promise<void>;
/**
 * Load and cache the manifest from disk.
 * Call this at production server startup.
 */
export declare function loadManifest(buildDir: string): Promise<RouteManifest>;
