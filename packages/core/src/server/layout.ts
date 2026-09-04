import { join, resolve } from "node:path";
import type { RouteModule } from "../shared/route-types.ts";
import { devBustedSpecifier } from "./env.ts";
import { layoutDirsFromFilePath, type RouteFile } from "./scanner.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LayoutChain {
  root: RouteModule;
  layouts: RouteModule[];
  route: RouteModule;
  /**
   * appDir-relative source paths for each module in the chain, for error
   * messages ("loader error in routes/blog/[id].tsx"). Optional so hand-built
   * chains in tests don't have to supply it.
   */
  files?: { root?: string; layouts: string[]; route?: string };
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

// ── resolveLayoutChain ─────────────────────────────────────────────────────

export async function resolveLayoutChain(routeFile: RouteFile, appDir: string): Promise<ResolvedRoute> {
  const layoutFiles: string[] = [];

  // root.tsx is always first — resolve to absolute so dynamic import works
  // regardless of which package file calls importRouteModule.
  const rootPath = resolve(join(appDir, "root.tsx"));
  if (await Bun.file(rootPath).exists()) {
    layoutFiles.push(rootPath);
  }

  // Intermediate layout.tsx files, outermost → innermost. Derived from the
  // file path so route-group folders ((marketing)/…) contribute their layout.
  for (const dir of layoutDirsFromFilePath(routeFile.filePath)) {
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

  for (const dir of layoutDirsFromFilePath(routeFile.filePath)) {
    const tsxKey = `routes/${dir}/layout.tsx`;
    const tsKey = `routes/${dir}/layout.ts`;
    if (registry[tsxKey]) layoutFiles.push(tsxKey);
    else if (registry[tsKey]) layoutFiles.push(tsKey);
  }

  return { ...routeFile, layoutFiles };
}

// ── importRouteModule ──────────────────────────────────────────────────────

export async function importRouteModule(filePath: string): Promise<RouteModule> {
  // Dev: cache-busted so edited loaders/actions are live without a restart.
  const spec = devBustedSpecifier(filePath);
  const mod = await import(spec);
  return {
    loader: mod.loader,
    action: mod.action,
    meta: mod.meta,
    headers: mod.headers,
    // SECURITY(high): like beforeLoad, route middleware can be an auth gate —
    // project it or every `middleware` export becomes a silent no-op.
    middleware: mod.middleware,
    // SECURITY(high): beforeLoad is the auth/redirect gate and `context` is the
    // per-route context factory. Both MUST be projected here — dropping them
    // turns every beforeLoad() export into a silent no-op, bypassing auth on
    // full-page GET, POST actions, and the /_data soft-nav endpoint alike.
    beforeLoad: mod.beforeLoad,
    context: mod.context,
    // searchSchema gates loader input — dropping it silently skips search
    // validation, so loaders would see raw strings where they expect coerced data.
    searchSchema: mod.searchSchema,
    // Selective-SSR surface: dropping `ssr` would silently restore full SSR
    // (running loaders the route opted out of); dropping `Fallback` would
    // SSR an empty outlet and guarantee a hydration mismatch.
    ssr: mod.ssr,
    Fallback: mod.Fallback,
    handle: mod.handle,
    ErrorBoundary: mod.ErrorBoundary,
    default: mod.default,
  } as RouteModule;
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
    headers: m.headers as RouteModule["headers"],
    // SECURITY(high): keep middleware (auth gate) — see importRouteModule.
    middleware: m.middleware as RouteModule["middleware"],
    // SECURITY(high): keep beforeLoad + context in the projection — see the
    // note in importRouteModule. The compiled-binary path goes through here.
    beforeLoad: m.beforeLoad as RouteModule["beforeLoad"],
    context: m.context as unknown,
    // Keep searchSchema too — see importRouteModule. Missing it here would
    // skip search validation only in compiled binaries, the worst kind of skew.
    searchSchema: m.searchSchema,
    ssr: m.ssr as RouteModule["ssr"],
    Fallback: m.Fallback as RouteModule["Fallback"],
    handle: m.handle as RouteModule["handle"],
    ErrorBoundary: m.ErrorBoundary as RouteModule["ErrorBoundary"],
    default: m.default as RouteModule["default"],
  } as RouteModule;
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
    return {
      root: rootMod,
      layouts: layoutMods,
      route: routeMod,
      files: { root: rootKey, layouts: layoutKeys, route: routeKey },
    };
  }

  const resolved = await resolveLayoutChain(routeFile, appDir);

  const [rootMod, ...layoutMods] = await Promise.all(resolved.layoutFiles.map(importRouteModule));
  const routeMod = await importRouteModule(resolve(join(appDir, routeFile.filePath)));

  // Relativize the absolute layout paths back to appDir-relative for messages.
  const appRoot = resolve(appDir);
  const rel = (abs: string) => (abs.startsWith(appRoot + "/") ? abs.slice(appRoot.length + 1) : abs);
  const [rootFile, ...layoutFiles] = resolved.layoutFiles.map(rel);

  return {
    root: rootMod ?? {},
    layouts: layoutMods,
    route: routeMod,
    files: { root: rootFile, layouts: layoutFiles, route: routeFile.filePath },
  };
}
