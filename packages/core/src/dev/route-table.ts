import { join, resolve } from "node:path";
import { extractApiRouteDefs, lintRouteModuleSource } from "../build/route-lint.ts";
import { scanRoutes } from "../server/scanner.ts";

export interface RouteTableRow {
  pattern: string;
  file: string;
  hasLoader: boolean;
  hasAction: boolean;
}

/**
 * Render a compact route inventory for the dev server boot log, so a developer
 * can see at a glance what routes the app matched (and which have data/mutation
 * handlers). Pure string formatting — no I/O.
 */
export function formatRouteTable(rows: RouteTableRow[]): string {
  if (rows.length === 0) return "[bractjs] no routes found under routes/";
  const sorted = [...rows].sort((a, b) => a.pattern.localeCompare(b.pattern));
  const patternWidth = Math.max(7, ...sorted.map((r) => r.pattern.length));
  const lines = sorted.map((r) => {
    const markers = [r.hasLoader ? "loader" : "", r.hasAction ? "action" : ""].filter(Boolean).join(" ");
    return `  ${r.pattern.padEnd(patternWidth)}  ${markers.padEnd(13)} ${r.file}`;
  });
  return [`[bractjs] ${rows.length} route${rows.length === 1 ? "" : "s"}:`, ...lines].join("\n");
}

export interface RouteInventory {
  rows: RouteTableRow[];
  /** Route-module lint warnings ("…exports `Loader`; did you mean `loader`?"). */
  warnings: string[];
}

/**
 * Scan `appDir`'s routes and read each module's source (no module execution):
 * the route table rows plus lint warnings. Shared by the dev boot log and
 * `bractjs routes`.
 */
export async function collectRouteRows(appDir: string): Promise<RouteInventory> {
  const routes = await scanRoutes(appDir);
  const rows: RouteTableRow[] = [];
  const warnings: string[] = [];
  for (const r of routes) {
    let src = "";
    try {
      src = await Bun.file(resolve(process.cwd(), appDir, r.filePath)).text();
    } catch {
      continue;
    }
    warnings.push(...lintRouteModuleSource(src, r.filePath));
    rows.push({
      pattern: r.urlPattern === "" ? "/" : "/" + r.urlPattern,
      file: r.filePath,
      hasLoader: /^export\s+(?:async\s+)?function\s+loader\b|^export\s+const\s+loader\b/m.test(src),
      hasAction: /^export\s+(?:async\s+)?function\s+action\b|^export\s+const\s+action\b/m.test(src),
    });
  }
  return { rows, warnings };
}

export interface ApiRouteRow {
  method: string;
  path: string;
  file: string;
}

/** Typed `/api` endpoints defined anywhere in `appDir` (static scan of `route("GET", "/api/…")` calls). */
export async function collectApiRouteRows(appDir: string): Promise<ApiRouteRow[]> {
  const out: ApiRouteRow[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for await (const rel of glob.scan(appDir)) {
    if (rel.startsWith("_generated/")) continue;
    let src: string;
    try {
      src = await Bun.file(join(appDir, rel)).text();
    } catch {
      continue;
    }
    for (const def of extractApiRouteDefs(src)) out.push({ ...def, file: rel });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** `bractjs routes`: pages, then typed API endpoints. */
export function formatApiRouteTable(rows: ApiRouteRow[]): string {
  if (rows.length === 0) return "";
  const pathWidth = Math.max(4, ...rows.map((r) => r.path.length));
  const lines = rows.map((r) => `  ${r.method.padEnd(7)} ${r.path.padEnd(pathWidth)}  ${r.file}`);
  return [`[bractjs] ${rows.length} API endpoint${rows.length === 1 ? "" : "s"}:`, ...lines].join("\n");
}
