import type { ServerManifest } from "../server/render.ts";
import { matchPatternForPath } from "./nav-utils.ts";

// ── Cache ──────────────────────────────────────────────────────────────────

const prefetched = new Set<string>();

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Prefetches both the route chunk and loader data for the given path.
 * De-duplicates via a module-level Set — safe to call on every hover.
 */
export function prefetchRoute(path: string, manifest: ServerManifest): void {
  if (prefetched.has(path)) return;
  prefetched.add(path);

  // Prefetch route chunk via <link rel="modulepreload">
  const pattern = matchPatternForPath(path, manifest);
  const chunk = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;
  if (chunk) {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = chunk;
    document.head.appendChild(link);
  }

  // Prefetch loader data at low priority
  void fetch(`/_data?path=${encodeURIComponent(path)}`, {
    priority: "low",
  } as RequestInit);
}
