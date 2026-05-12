import type { ServerManifest } from "../server/render.ts";

// ── Pattern Matching ───────────────────────────────────────────────────────

/**
 * Tests whether a pathname matches a manifest route pattern.
 * Pattern segments: "static", "[param]", "[...catchAll]"
 */
function patternMatches(pathname: string, pattern: string): boolean {
  const pathSegs = pathname.replace(/^\//, "").split("/").filter(Boolean);
  const patSegs = pattern === "" ? [] : pattern.split("/");
  let p = 0;
  for (const seg of patSegs) {
    if (seg.startsWith("[...") && seg.endsWith("]")) return true; // catch-all: rest matches
    if (p >= pathSegs.length) return false;
    if (!(seg.startsWith("[") && seg.endsWith("]"))) {
      if (seg !== pathSegs[p]) return false; // static: must be exact
    }
    p++; // param or matching static: consume one segment
  }
  return p === pathSegs.length;
}

// ── Export ─────────────────────────────────────────────────────────────────

/** Returns the manifest pattern key that matches pathname, or null. */
export function matchPatternForPath(
  pathname: string,
  manifest: ServerManifest,
): string | null {
  for (const pattern of Object.keys(manifest.routes)) {
    if (patternMatches(pathname, pattern)) return pattern;
  }
  return null;
}
