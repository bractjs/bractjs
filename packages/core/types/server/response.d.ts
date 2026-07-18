export interface RedirectOptions {
    /** Allow absolute URLs to other origins. Default false. */
    allowExternal?: boolean;
}
export declare function isSafeInternalRedirect(url: string): boolean;
export declare function redirect(url: string, status?: number, headers?: HeadersInit, options?: RedirectOptions): Response;
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
