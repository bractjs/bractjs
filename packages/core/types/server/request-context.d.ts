/** Run `fn` with `request` as the current request. */
export declare function runWithRequest<T>(request: Request, fn: () => T): T;
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
export declare function getRequest(): Request;
/**
 * The current request's id, set by the `requestId()` middleware — for logs,
 * error reports and support messages ("quote this id"). Undefined outside a
 * request or when `requestId()` isn't registered.
 */
export declare function getRequestId(): string | undefined;
/** Record the current request's id (the requestId() middleware). */
export declare function setRequestId(id: string): void;
