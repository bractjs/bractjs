import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RouteManifestEntry {
  chunk: string;
  pattern: string;
}

export interface RouteManifest {
  version: 1;
  clientEntry: string;
  rootChunk?: string;
  routes: Record<string, RouteManifestEntry>;
}

// ── Module-scope cache ─────────────────────────────────────────────────────

let cached: RouteManifest | null = null;

// ── Functions ──────────────────────────────────────────────────────────────

/**
 * Build a RouteManifest from hashed output paths.
 * @param opts.clientEntry   Hashed path to main client bundle
 * @param opts.routeChunks  Map<urlPattern, hashedChunkPath>
 */
export function generateManifest(opts: {
  clientEntry: string;
  rootChunk?: string;
  routeChunks: Map<string, string>;
}): RouteManifest {
  const routes: Record<string, RouteManifestEntry> = {};
  for (const [pattern, chunk] of opts.routeChunks) {
    routes[pattern] = { chunk, pattern };
  }
  return { version: 1, clientEntry: opts.clientEntry, rootChunk: opts.rootChunk, routes };
}

/**
 * Write manifest to {outDir}/route-manifest.json (pretty-printed).
 */
export async function writeManifest(
  manifest: RouteManifest,
  outDir: string,
): Promise<void> {
  const dest = join(outDir, "route-manifest.json");
  await Bun.write(dest, JSON.stringify(manifest, null, 2));
}

/**
 * Load and cache the manifest from disk.
 * Call this at production server startup.
 */
export async function loadManifest(buildDir: string): Promise<RouteManifest> {
  if (cached) return cached;
  const src = join(buildDir, "route-manifest.json");
  cached = (await Bun.file(src).json()) as RouteManifest;
  return cached;
}
