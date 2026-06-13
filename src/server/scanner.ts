import { basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export type Segment =
  | string
  | { param: string }
  | { optional: string }
  | { catchAll: string };

export interface RouteFile {
  filePath: string;
  urlPattern: string;
  segments: Segment[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** A path segment that is a route group: `(marketing)`. Contributes a layout
 *  folder but no URL segment. */
export function isRouteGroupSegment(seg: string): boolean {
  return seg.startsWith("(") && seg.endsWith(")") && seg.length > 2;
}

export function pathToSegments(pattern: string): Segment[] {
  if (pattern === "") return [];
  return pattern.split("/").map((seg) => {
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      return { catchAll: seg.slice(4, -1) };
    }
    // Optional param: [[id]] → matches with or without the segment present.
    if (seg.startsWith("[[") && seg.endsWith("]]")) {
      return { optional: seg.slice(2, -2) };
    }
    if (seg.startsWith("[") && seg.endsWith("]")) {
      return { param: seg.slice(1, -1) };
    }
    return seg;
  });
}

export function filePathToPattern(filePath: string): string {
  // Strip "routes/" prefix and file extension
  let path = filePath.replace(/^routes\//, "").replace(/\.(tsx|ts)$/, "");

  // Drop route-group segments — `(marketing)/about` → `about`. They group
  // files (and their layout.tsx) without adding a URL segment.
  path = path
    .split("/")
    .filter((seg) => !isRouteGroupSegment(seg))
    .join("/");

  // Handle nested _index (e.g. blog/_index → blog)
  path = path.replace(/\/_index$/, "");

  // Handle root _index
  if (path === "_index" || path === "") return "";

  // Convert [param], [[optional]], and [...catchAll] segments — keep as-is for
  // the pattern string.
  return path;
}

/**
 * Ancestor directory chain (relative to `routes/`) for a route file, outermost
 * → innermost, used to locate nesting `layout.tsx` files. Derived from the FILE
 * path (not the URL pattern) so route-group folders like `(marketing)` are
 * included — their layout wraps children even though they add no URL segment.
 *
 * `routes/(marketing)/blog/[id].tsx` → `["(marketing)", "(marketing)/blog"]`.
 */
export function layoutDirsFromFilePath(filePath: string): string[] {
  const rel = filePath.replace(/^routes\//, "").replace(/\.(tsx|ts)$/, "");
  const parts = rel.split("/");
  parts.pop(); // drop the file's own basename — only ancestor dirs hold layouts
  const dirs: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

function segmentScore(seg: Segment): number {
  if (typeof seg === "string") return 0;       // static
  if ("param" in seg) return 1;                // dynamic
  if ("optional" in seg) return 2;             // optional dynamic
  return 3;                                    // catch-all
}

function routeScore(route: RouteFile): number {
  return route.segments.reduce((sum, seg) => sum + segmentScore(seg), 0);
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function scanRoutes(appDir: string): Promise<RouteFile[]> {
  const glob = new Bun.Glob("routes/**/*.{tsx,ts}");
  const routes: RouteFile[] = [];

  for await (const filePath of glob.scan(appDir)) {
    // Skip layout files — handled separately. Use basename so this also
    // skips top-level "routes/layout.tsx" on any OS.
    const base = basename(filePath);
    if (base === "layout.tsx" || base === "layout.ts") {
      continue;
    }

    const urlPattern = filePathToPattern(filePath);
    const segments = pathToSegments(urlPattern);
    routes.push({ filePath, urlPattern, segments });
  }

  return routes.sort((a, b) => routeScore(a) - routeScore(b));
}
