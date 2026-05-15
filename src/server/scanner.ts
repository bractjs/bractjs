import { basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export type Segment = string | { param: string } | { catchAll: string };

export interface RouteFile {
  filePath: string;
  urlPattern: string;
  segments: Segment[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function pathToSegments(pattern: string): Segment[] {
  if (pattern === "") return [];
  return pattern.split("/").map((seg) => {
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      return { catchAll: seg.slice(4, -1) };
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

  // Handle nested _index (e.g. blog/_index → blog)
  path = path.replace(/\/_index$/, "");

  // Handle root _index
  if (path === "_index" || path === "") return "";

  // Convert [param] and [...catchAll] segments — keep as-is for pattern string
  return path;
}

function segmentScore(seg: Segment): number {
  if (typeof seg === "string") return 0;       // static
  if ("param" in seg) return 1;                // dynamic
  return 2;                                    // catch-all
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
