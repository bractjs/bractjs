import { extractExports } from "./directives.ts";

// The canonical route-module export names. A route file exporting a near-miss
// (wrong case) of one of these is almost always a mistake — the framework's
// projection is case-sensitive, so `Loader` is silently ignored.
export const ROUTE_EXPORT_NAMES = [
  "default", "loader", "action", "clientLoader", "clientAction", "meta", "headers",
  "middleware", "beforeLoad", "shouldRevalidate", "searchSchema", "ssr", "Fallback",
  "handle", "ErrorBoundary", "config", "loaderDeps", "context",
  // React Router route exports BractJS reads too.
  "links", "HydrateFallback", "unstable_middleware",
] as const;

// Remix / React Router route exports BractJS does not read — a ported route
// keeps compiling but the export silently does nothing. Name → what to do instead.
const PORTED_EXPORT_ADVICE: Record<string, string> = {
  clientMiddleware: "BractJS has no client middleware — use `clientLoader`, or server `middleware`.",
  unstable_clientMiddleware: "BractJS has no client middleware — use `clientLoader`, or server `middleware`.",
};

const CANONICAL_LOWER = new Map(ROUTE_EXPORT_NAMES.map((n) => [n.toLowerCase(), n]));
const CANONICAL_SET = new Set<string>(ROUTE_EXPORT_NAMES);

/** A route is "renderable or does work" if it has any of these. */
const MEANINGFUL = ["default", "loader", "action", "beforeLoad"];

/**
 * Static lint of a route module's SOURCE (no execution). Returns human-readable
 * warning strings. Used by the dev rebuilder and the production build to catch
 * common, silent mistakes: a route that renders nothing, an export whose casing
 * doesn't match a framework export, and a Remix / React Router export BractJS
 * doesn't read (all three are otherwise ignored without a trace).
 */
/** A typed API route definition found in source: `route("GET", "/api/x", …)`. */
export interface ApiRouteDef {
  method: string;
  path: string;
}

// Matches `route("GET", "/api/x"` and `bract.route('POST', '/api/y'` — the
// method and path are always inline string literals in the supported pattern.
const API_ROUTE_CALL = /\broute\(\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;

/**
 * Statically extract typed API route definitions from a module's SOURCE (no
 * execution). Used by the dev server to warn when a defined endpoint never
 * registered — registration is an import side effect, so a `route()` call in
 * a module nothing imports silently doesn't exist.
 */
export function extractApiRouteDefs(src: string): ApiRouteDef[] {
  const defs: ApiRouteDef[] = [];
  for (const m of src.matchAll(API_ROUTE_CALL)) {
    defs.push({ method: m[1], path: m[2] });
  }
  return defs;
}

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
    const advice = PORTED_EXPORT_ADVICE[name];
    if (advice) {
      warnings.push(`${filePath}: export "${name}" is ignored — ${advice}`);
      continue;
    }
    const canonical = CANONICAL_LOWER.get(name.toLowerCase());
    if (canonical && canonical !== name) {
      warnings.push(
        `${filePath}: export "${name}" looks like "${canonical}" — route exports are case-sensitive, so "${name}" is ignored.`,
      );
    }
  }

  return warnings;
}
