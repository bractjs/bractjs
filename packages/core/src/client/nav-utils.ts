import type { ServerManifest } from "../server/render.ts";

// ── Redirect normalization ─────────────────────────────────────────────────

/**
 * Normalize a Location/redirect target to a same-origin path the client router
 * can match. Returns an internal "/path?query#hash" for same-origin targets, or
 * `null` for off-origin, protocol-relative, or malformed values — the caller
 * MUST NOT feed a null result to the SPA router (an off-origin Location should
 * trigger a full-page navigation instead, so the browser applies its own
 * cross-origin protections). This is the client-side complement to the server's
 * `sanitizeRedirect()`: it stops a soft-nav from silently following an
 * attacker-controlled `Location` header.
 */
export function toSamePath(loc: string): string | null {
  try {
    const u = new URL(loc, window.location.href);
    if (u.origin !== window.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

// ── Navigation target parsing ──────────────────────────────────────────────

/**
 * Split an internal navigation target ("/path", "/path?q", "/path#h",
 * "/path?q#h") into its parts. Callers must normalize absolute URLs through
 * `toSamePath()` first — this is a pure string split, not a URL parser.
 */
export function parseTo(to: string): { pathname: string; search: string; hash: string } {
  const hashIdx = to.indexOf("#");
  const hash = hashIdx === -1 ? "" : to.slice(hashIdx);
  const beforeHash = hashIdx === -1 ? to : to.slice(0, hashIdx);
  const searchIdx = beforeHash.indexOf("?");
  const search = searchIdx === -1 ? "" : beforeHash.slice(searchIdx);
  const pathname = searchIdx === -1 ? beforeHash : beforeHash.slice(0, searchIdx);
  return { pathname: pathname || "/", search, hash };
}

/** Random short key identifying a history entry (scroll restoration identity). */
export function createLocationKey(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

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

/**
 * Specificity score for a matching pattern, used to pick the best match the
 * same way the server's trie does: static > dynamic > catch-all. Higher wins.
 * Object key order is not reliable for priority, so we must score, not
 * first-match (otherwise `[...slug]` can shadow `_index` / static routes).
 */
function patternScore(pattern: string): number {
  if (pattern === "") return 1_000_000; // index route — most specific for "/"
  let score = 0;
  for (const seg of pattern.split("/")) {
    score *= 10;
    if (seg.startsWith("[...") && seg.endsWith("]"))
      score += 1; // catch-all
    else if (seg.startsWith("[") && seg.endsWith("]"))
      score += 2; // dynamic
    else score += 3; // static
  }
  return score;
}

// ── Export ─────────────────────────────────────────────────────────────────

/** Returns the highest-priority manifest pattern that matches pathname, or null. */
export function matchPatternForPath(pathname: string, manifest: ServerManifest): string | null {
  // Exact static match wins outright (most specific) — also a fast path.
  const normalized = pathname.replace(/^\//, "");
  if (normalized in manifest.routes) return normalized;

  let best: string | null = null;
  let bestScore = -1;
  for (const pattern of Object.keys(manifest.routes)) {
    if (!patternMatches(pathname, pattern)) continue;
    const score = patternScore(pattern);
    if (score > bestScore) {
      best = pattern;
      bestScore = score;
    }
  }
  return best;
}
