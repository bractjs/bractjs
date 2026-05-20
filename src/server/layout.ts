import { join, resolve } from "node:path";
import type { RouteFile } from "./scanner.ts";
import type { RouteModule } from "../shared/route-types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LayoutChain {
  root: RouteModule;
  layouts: RouteModule[];
  route: RouteModule;
}

export interface ResolvedRoute extends RouteFile {
  layoutFiles: string[];
}

/**
 * Pre-loaded module map keyed by appDir-relative path (e.g. "root.tsx",
 * "routes/blog/layout.tsx"). When `resolveRouteChain` is called with a
 * registry, all module lookups go through the registry instead of dynamic
 * `import(absPath)` — this is what makes `bun build --compile` viable.
 */
export type ModuleRegistry = Record<string, RouteModule | Record<string, unknown>>;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive the ancestor directory segments from a route's urlPattern. */
function layoutDirs(urlPattern: string): string[] {
  if (urlPattern === "") return [];
  const segments = urlPattern.split("/");
  // For "blog/[id]" → check "routes/blog/layout.tsx" only (not the leaf)
  segments.pop();
  const dirs: string[] = [];
  for (let i = 1; i <= segments.length; i++) {
    dirs.push(segments.slice(0, i).join("/"));
  }
  return dirs;
}

// ── resolveLayoutChain ─────────────────────────────────────────────────────

export async function resolveLayoutChain(
  routeFile: RouteFile,
  appDir: string
): Promise<ResolvedRoute> {
  const layoutFiles: string[] = [];

  // root.tsx is always first — resolve to absolute so dynamic import works
  // regardless of which package file calls importRouteModule.
  const rootPath = resolve(join(appDir, "root.tsx"));
  if (await Bun.file(rootPath).exists()) {
    layoutFiles.push(rootPath);
  }

  // Intermediate layout.tsx files, outermost → innermost
  for (const dir of layoutDirs(routeFile.urlPattern)) {
    const layoutPath = resolve(join(appDir, "routes", dir, "layout.tsx"));
    if (await Bun.file(layoutPath).exists()) {
      layoutFiles.push(layoutPath);
    }
  }

  return { ...routeFile, layoutFiles };
}

/**
 * Registry-driven equivalent of `resolveLayoutChain`. Skips all filesystem
 * checks — returns the appDir-relative keys that exist in the registry, in
 * the same root-first, outermost-to-innermost order. Required for compiled
 * binaries where `Bun.file().exists()` against the original app paths is
 * unreliable.
 */
export function resolveLayoutChainFromRegistry(
  routeFile: RouteFile,
  registry: ModuleRegistry,
): ResolvedRoute {
  const layoutFiles: string[] = [];
  if (registry["root.tsx"]) layoutFiles.push("root.tsx");
  else if (registry["root.ts"]) layoutFiles.push("root.ts");

  for (const dir of layoutDirs(routeFile.urlPattern)) {
    const tsxKey = `routes/${dir}/layout.tsx`;
    const tsKey = `routes/${dir}/layout.ts`;
    if (registry[tsxKey]) layoutFiles.push(tsxKey);
    else if (registry[tsKey]) layoutFiles.push(tsKey);
  }

  return { ...routeFile, layoutFiles };
}

// ── importRouteModule ──────────────────────────────────────────────────────

export async function importRouteModule(filePath: string): Promise<RouteModule> {
  const mod = await import(filePath);
  return {
    loader: mod.loader,
    action: mod.action,
    meta: mod.meta,
    handle: mod.handle,
    ErrorBoundary: mod.ErrorBoundary,
    default: mod.default,
  };
}

/**
 * Project a registry entry (raw `import * as ns` namespace) into the
 * subset shape `RouteModule` requires. Mirrors `importRouteModule` but
 * skips the dynamic `import()` because the module is already loaded.
 */
function pickRouteModule(mod: Record<string, unknown> | RouteModule | undefined): RouteModule {
  if (!mod) return {};
  const m = mod as Record<string, unknown>;
  return {
    loader: m.loader as RouteModule["loader"],
    action: m.action as RouteModule["action"],
    meta: m.meta as RouteModule["meta"],
    handle: m.handle as RouteModule["handle"],
    ErrorBoundary: m.ErrorBoundary as RouteModule["ErrorBoundary"],
    default: m.default as RouteModule["default"],
  };
}

// ── resolveRouteChain ──────────────────────────────────────────────────────

/**
 * Build the route + layout chain for a matched route.
 *
 * Two modes:
 * - Registry mode (production / compiled binary): when `registry` is provided,
 *   no filesystem checks and no dynamic imports run. Every module lookup is a
 *   `Record` access keyed by appDir-relative path.
 * - Dev mode (no registry): existing filesystem-probe + `import(absPath)`
 *   path, used by `bractjs dev` so edits to layouts/routes don't require a
 *   codegen rerun.
 */
export async function resolveRouteChain(
  routeFile: RouteFile,
  appDir: string,
  registry?: ModuleRegistry,
): Promise<LayoutChain> {
  if (registry) {
    const resolved = resolveLayoutChainFromRegistry(routeFile, registry);
    const [rootKey, ...layoutKeys] = resolved.layoutFiles;
    const rootMod = rootKey ? pickRouteModule(registry[rootKey]) : {};
    const layoutMods = layoutKeys.map((k) => pickRouteModule(registry[k]));
    const routeKey = routeFile.filePath.split("\\").join("/");
    const routeMod = pickRouteModule(registry[routeKey]);
    return { root: rootMod, layouts: layoutMods, route: routeMod };
  }

  const resolved = await resolveLayoutChain(routeFile, appDir);

  const [rootMod, ...layoutMods] = await Promise.all(
    resolved.layoutFiles.map(importRouteModule)
  );
  const routeMod = await importRouteModule(
    resolve(join(appDir, routeFile.filePath))
  );

  return {
    root: rootMod ?? {},
    layouts: layoutMods,
    route: routeMod,
  };
}
