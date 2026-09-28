export interface RedirectOptions {
    /** Allow absolute URLs to other origins. Default false. */
    allowExternal?: boolean;
}
/** Object form of `redirect`'s second argument — the Remix / React Router shape. */
export interface RedirectInit extends RedirectOptions {
    /** Default 302. */
    status?: number;
    headers?: HeadersInit;
}
export declare function isSafeInternalRedirect(url: string): boolean;
/**
 * Build a redirect Response. The second argument is a status code or, as in
 * Remix / React Router, an init object:
 *
 *   redirect("/login")                                     // 302
 *   redirect("/login", 303, { "Set-Cookie": c })           // positional
 *   redirect("/login", { status: 303, headers: { "Set-Cookie": c } })
 */
export declare function redirect(url: string, init?: number | RedirectInit, headers?: HeadersInit, options?: RedirectOptions): Response;
/**
 * Last-line guard applied to every redirect Response the request handler is
 * about to emit. Returns the Response untouched unless it is a 3xx whose
 * `Location` escapes `requestUrl`'s origin AND it was not produced by
 * `redirect(..., { allowExternal: true })`. In that case the off-origin
 * Location is treated as an open-redirect attempt: it is logged and replaced
 * with a 500 so the client never follows it.
 */
export declare function sanitizeRedirect(res: Response, requestUrl: string): Response;
export declare function json<T>(data: T, init?: ResponseInit): Response;
export declare function error(message: string, status?: number): Response;
