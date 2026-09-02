import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

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
  /** Per-pattern CSS bundles, keyed like `routeChunks`. */
  routeCss?: Map<string, string[]>;
  entryCss?: string[];
  rootCss?: string[];
  mode?: "production";
}): RouteManifest {
  const routes: Record<string, RouteManifestEntry> = {};
  for (const [pattern, chunk] of opts.routeChunks) {
    const css = opts.routeCss?.get(pattern);
    // Omit the key entirely when there's no CSS, so manifests stay diff-clean
    // and byte-identical to pre-CSS output for apps that don't use styles.
    routes[pattern] = css?.length ? { chunk, pattern, css } : { chunk, pattern };
  }
  return {
    version: 1,
    mode: opts.mode,
    clientEntry: opts.clientEntry,
    rootChunk: opts.rootChunk,
    ...(opts.entryCss?.length ? { entryCss: opts.entryCss } : {}),
    ...(opts.rootCss?.length ? { rootCss: opts.rootCss } : {}),
    routes,
  };
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
