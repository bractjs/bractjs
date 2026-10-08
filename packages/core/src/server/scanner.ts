import { basename } from "node:path";

// The pure pattern helpers live in shared/ (the client uses them too).
export {
  filePathToPattern,
  isRouteGroupSegment,
  layoutDirsFromFilePath,
  pathToSegments,
  type RouteFile,
  type Segment,
} from "../shared/route-patterns.ts";
import { filePathToPattern, pathToSegments, type RouteFile, type Segment } from "../shared/route-patterns.ts";

function segmentScore(seg: Segment): number {
  if (typeof seg === "string") return 0; // static
  if ("param" in seg) return 1; // dynamic
  if ("optional" in seg) return 2; // optional dynamic
  return 3; // catch-all
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

/** A route's segments as a React Router pattern: `/blog/:id`, `/docs/:lang?`, `/files/*`. */
export function routePatternOf(segments: Segment[]): string {
  const parts = segments.map((s) =>
    typeof s === "string" ? s : "param" in s ? `:${s.param}` : "optional" in s ? `:${s.optional}?` : "*",
  );
  return "/" + parts.join("/");
}
