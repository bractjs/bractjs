import type { ActionEntry } from "./action-registry.ts";
import { type ModuleRegistry } from "./layout.ts";
import { type MiddlewareFn, type RouteMiddleware } from "./middleware.ts";
/**
 * Guard one `"use server"` action with its own middleware, which runs after the
 * route middleware the action already gets from its file's location:
 *
 *   "use server";
 *   export const deletePost = withMiddleware([requireAdmin], async (id: string) => { … });
 *
 * Returns `fn` itself (tagged), so the export stays a plain callable function.
 */
export declare function withMiddleware<F extends (...args: never[]) => unknown>(middleware: MiddlewareFn[], fn: F): F;
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
export declare function actionMiddlewareChain(entry: ActionEntry, appDir: string, registry?: ModuleRegistry): Promise<RouteMiddleware[]>;
