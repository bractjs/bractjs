// Namespace import: route modules reach this file through the package barrel,
// and the client build resolves the whole graph (see compression.ts).
import * as asyncHooks from "node:async_hooks";

// The incoming request, available anywhere in its async call chain. The fetch
// handler (serve.ts) enters this scope once per request, around the global
// middleware pipeline, so it covers server actions, /_stream, loaders, typed
// /api handlers and SSR alike.
interface RequestScope {
  request: Request;
  /** Set by the requestId() middleware. */
  requestId?: string;
}
const storage = new asyncHooks.AsyncLocalStorage<RequestScope>();

/** Run `fn` with `request` as the current request. */
export function runWithRequest<T>(request: Request, fn: () => T): T {
  return storage.run({ request }, fn);
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
  const request = storage.getStore()?.request;
  if (!request) {
    throw new Error(
      "[bractjs] getRequest() was called outside a request. Call it inside a server action, loader, action, " +
        "or API handler — not at module scope or in code that runs after the response finished.",
    );
  }
  return request;
}

/**
 * The current request's id, set by the `requestId()` middleware — for logs,
 * error reports and support messages ("quote this id"). Undefined outside a
 * request or when `requestId()` isn't registered.
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Record the current request's id (the requestId() middleware). */
export function setRequestId(id: string): void {
  const scope = storage.getStore();
  if (scope) scope.requestId = id;
}
