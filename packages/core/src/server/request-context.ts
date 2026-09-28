// Namespace import: route modules reach this file through the package barrel,
// and the client build resolves the whole graph (see compression.ts).
import * as asyncHooks from "node:async_hooks";

// The incoming request, available anywhere in its async call chain. The fetch
// handler (serve.ts) enters this scope once per request, around the global
// middleware pipeline, so it covers server actions, /_stream, loaders, typed
// /api handlers and SSR alike.
const storage = new asyncHooks.AsyncLocalStorage<Request>();

/** Run `fn` with `request` as the current request. */
export function runWithRequest<T>(request: Request, fn: () => T): T {
  return storage.run(request, fn);
}

/**
 * The HTTP request currently being handled. Use it where the request isn't
 * passed in — above all inside `"use server"` actions, which receive only the
 * caller's arguments and must authorize themselves:
 *
 *   "use server";
 *   export async function deletePost(id: string) {
 *     const user = await requireUser(getRequest()); // reads the session cookie
 *     ...
 *   }
 *
 * In a loader or action prefer its `request` argument (for `/_data` it carries
 * the target page's URL; this returns the raw `/_data` request). Throws when
 * called outside a request, e.g. at module scope.
 */
export function getRequest(): Request {
  const request = storage.getStore();
  if (!request) {
    throw new Error(
      "[bractjs] getRequest() was called outside a request. Call it inside a server action, loader, action, " +
        "or API handler — not at module scope or in code that runs after the response finished.",
    );
  }
  return request;
}
