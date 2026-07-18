export interface RouteManifestEntry {
    chunk: string;
    pattern: string;
}
export interface RouteManifest {
    version: 1;
    /** "production" = produced by `bractjs build`. Absent on dev-rebuilder manifests. */
    mode?: "production";
    clientEntry: string;
    rootChunk?: string;
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
