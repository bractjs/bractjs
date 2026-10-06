import { relative, resolve } from "node:path";
import type { ActionEntry } from "./action-registry.ts";
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
export async function actionMiddlewareChain(
  entry: ActionEntry,
  appDir: string,
  registry?: ModuleRegistry,
): Promise<RouteMiddleware[]> {
  const own = (entry.fn as Guarded)[ACTION_MIDDLEWARE] ?? [];

  let chain: RouteMiddleware[];
  if (isRoutesPath(entry.relPath)) {
    const routeFile = { filePath: entry.relPath, urlPattern: "", segments: [] };
    let files: string[];
    let mods: Array<{ middleware?: unknown; unstable_middleware?: unknown }>;
    if (registry) {
      files = resolveLayoutChainFromRegistry(routeFile, registry).layoutFiles;
      mods = files.map((k) => (registry[k] ?? {}) as { middleware?: unknown });
    } else {
      const abs = (await resolveLayoutChain(routeFile, appDir)).layoutFiles;
      const root = resolve(appDir);
      files = abs.map((f) => relative(root, f).split("\\").join("/"));
      mods = await Promise.all(abs.map(importRouteModule));
    }
    // A layout's own actions: the layout is already in the chain.
    const isLayoutItself = files.includes(entry.relPath.split("\\").join("/"));
    chain = collectRouteMiddleware({
      root: {},
      layouts: mods,
      route: isLayoutItself ? {} : entry.mod,
      files: { layouts: files, route: entry.relPath },
    });
  } else {
    const rootChain = await resolveRootChain(appDir, registry);
    chain = collectRouteMiddleware({ ...rootChain, route: {} });
  }
  return own.length ? [...chain, ...own] : chain;
}
