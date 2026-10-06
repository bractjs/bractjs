import { relative, resolve } from "node:path";
import { type ActionEntry, actionExporters } from "./action-registry.ts";
import {
  importRouteModule,
  type ModuleRegistry,
  resolveLayoutChain,
  resolveLayoutChainFromRegistry,
  resolveRootChain,
} from "./layout.ts";
import { collectRouteMiddleware, type MiddlewareFn, type RouteMiddleware } from "./middleware.ts";

const ACTION_MIDDLEWARE = Symbol.for("bractjs.actionMiddleware");

type Guarded = { [ACTION_MIDDLEWARE]?: MiddlewareFn[] };

/**
 * Guard one `"use server"` action with its own middleware, which runs after the
 * route middleware the action already gets from its file's location:
 *
 *   "use server";
 *   export const deletePost = withMiddleware([requireAdmin], async (id: string) => { … });
 *
 * Returns `fn` itself (tagged), so the export stays a plain callable function.
 */
export function withMiddleware<F extends (...args: never[]) => unknown>(
  middleware: MiddlewareFn[],
  fn: F,
): F {
  if (typeof fn !== "function") throw new TypeError("withMiddleware(middleware, fn): fn must be a function");
  const list = Array.isArray(middleware) ? middleware : [middleware];
  const tagged = fn as F & Guarded;
  tagged[ACTION_MIDDLEWARE] = [...(tagged[ACTION_MIDDLEWARE] ?? []), ...list];
  return fn;
}

function isRoutesPath(rel: string): boolean {
  return rel.split("\\").join("/").startsWith("routes/");
}

/**
 * SECURITY(high): the middleware chain a `"use server"` action runs behind,
 * derived from WHERE THE ACTION IS DEFINED — never from the Referer or the
 * calling page's URL, which the client controls.
 *
 * - A module under `routes/` gets root → the layouts above its file → its own
 *   `middleware` export: exactly the chain that guards a page at that spot,
 *   so an auth guard in `routes/admin/layout.tsx` also guards the actions in
 *   `routes/admin/**`.
 * - Any other module (`app/*.server.ts`) gets root's middleware, which runs
 *   for every page.
 * - `withMiddleware([...], fn)` appends the action's own middleware.
 */
type ChainModule = { middleware?: unknown; unstable_middleware?: unknown };

/** The modules (file → module) whose middleware guards actions exported by `exporter`, outermost first. */
async function chainModulesFor(
  exporter: { relPath: string; mod: Record<string, unknown> },
  appDir: string,
  registry?: ModuleRegistry,
): Promise<Array<[string, ChainModule]>> {
  if (!isRoutesPath(exporter.relPath)) {
    const rootChain = await resolveRootChain(appDir, registry);
    return rootChain.files?.root ? [[rootChain.files.root, rootChain.root]] : [];
  }
  const routeFile = { filePath: exporter.relPath, urlPattern: "", segments: [] };
  let files: string[];
  let mods: ChainModule[];
  if (registry) {
    files = resolveLayoutChainFromRegistry(routeFile, registry).layoutFiles;
    mods = files.map((k) => (registry[k] ?? {}) as ChainModule);
  } else {
    const abs = (await resolveLayoutChain(routeFile, appDir)).layoutFiles;
    const root = resolve(appDir);
    files = abs.map((f) => relative(root, f).split("\\").join("/"));
    mods = await Promise.all(abs.map(importRouteModule));
  }
  const pairs: Array<[string, ChainModule]> = files.map((f, i) => [f, mods[i]]);
  // The exporting module's own middleware last (a layout's own actions: it's already in).
  const self = exporter.relPath.split("\\").join("/");
  if (!files.includes(self)) pairs.push([self, exporter.mod]);
  return pairs;
}

/**
 * SECURITY(high): the middleware chain a `"use server"` action runs behind,
 * derived from WHERE THE ACTION IS EXPORTED — never from the Referer or the
 * calling page's URL, which the client controls.
 *
 * - A module under `routes/` gets root → the layouts above its file → its own
 *   `middleware` export: exactly the chain that guards a page at that spot,
 *   so an auth guard in `routes/admin/layout.tsx` also guards the actions in
 *   `routes/admin/**`.
 * - Any other module (`app/*.server.ts`) gets root's middleware, which runs
 *   for every page.
 * - A function exported by SEVERAL modules (re-exported elsewhere) runs the
 *   union of their chains, each module's middleware once: re-exporting an
 *   admin action from an unguarded module must not unguard it.
 * - `withMiddleware([...], fn)` appends the action's own middleware.
 */
export async function actionMiddlewareChain(
  entry: ActionEntry,
  appDir: string,
  registry?: ModuleRegistry,
): Promise<RouteMiddleware[]> {
  const own = (entry.fn as Guarded)[ACTION_MIDDLEWARE] ?? [];
  const modules = new Map<string, ChainModule>();
  for (const exporter of actionExporters(entry)) {
    for (const [file, mod] of await chainModulesFor(exporter, appDir, registry)) {
      if (!modules.has(file)) modules.set(file, mod);
    }
  }
  const chain = collectRouteMiddleware({
    root: {},
    layouts: [...modules.values()],
    route: {},
    files: { layouts: [...modules.keys()] },
  });
  return own.length ? [...chain, ...own] : chain;
}
