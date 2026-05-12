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

// ── resolveRouteChain ──────────────────────────────────────────────────────

export async function resolveRouteChain(
  routeFile: RouteFile,
  appDir: string
): Promise<LayoutChain> {
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
