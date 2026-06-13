import { extractExports } from "./directives.ts";

// The canonical route-module export names. A route file exporting a near-miss
// (wrong case) of one of these is almost always a mistake — the framework's
// projection is case-sensitive, so `Loader` is silently ignored.
export const ROUTE_EXPORT_NAMES = [
  "default", "loader", "action", "meta", "beforeLoad", "shouldRevalidate",
  "searchSchema", "ssr", "Fallback", "handle", "ErrorBoundary", "config",
  "loaderDeps", "context",
] as const;

const CANONICAL_LOWER = new Map(ROUTE_EXPORT_NAMES.map((n) => [n.toLowerCase(), n]));
const CANONICAL_SET = new Set<string>(ROUTE_EXPORT_NAMES);

/** A route is "renderable or does work" if it has any of these. */
const MEANINGFUL = ["default", "loader", "action", "beforeLoad"];

/**
 * Static lint of a route module's SOURCE (no execution). Returns human-readable
 * warning strings. Used by the dev rebuilder and the production build to catch
 * two common, silent mistakes: a route that renders nothing, and an export
 * whose casing doesn't match a framework export (so it's ignored).
 */
export function lintRouteModuleSource(src: string, filePath: string): string[] {
  const warnings: string[] = [];
  const names = extractExports(src);
  // extractExports misses anonymous `export default () => …` / `export default function() {}`.
  const hasAnonDefault = /^export\s+default\b/m.test(src) && !names.includes("default");
  const exportSet = new Set(names);
  if (hasAnonDefault) exportSet.add("default");

  if (!MEANINGFUL.some((n) => exportSet.has(n))) {
    warnings.push(
      `${filePath}: route has no default/loader/action/beforeLoad export — it renders an empty page.`,
    );
  }

  for (const name of exportSet) {
    if (CANONICAL_SET.has(name)) continue;
    const canonical = CANONICAL_LOWER.get(name.toLowerCase());
    if (canonical && canonical !== name) {
      warnings.push(
        `${filePath}: export "${name}" looks like "${canonical}" — route exports are case-sensitive, so "${name}" is ignored.`,
      );
    }
  }

  return warnings;
}
