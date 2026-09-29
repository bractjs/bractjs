export declare class BractJSError extends Error {
    readonly status: number;
    constructor(message: string, status?: number);
}
export declare class HttpError extends BractJSError {
    /** Standard reason phrase for `status` (React Router `ErrorResponse.statusText`). */
    readonly statusText: string;
    /** The error payload (React Router `ErrorResponse.data`) — the message unless a richer value was thrown. */
    data: unknown;
    /** Always false: this error came from app code, not a router-internal 404/405. */
    readonly internal = false;
    constructor(status: number, message?: string);
}
/**
 * React Router's `isRouteErrorResponse`: true for an error that carries an
 * HTTP status — a thrown `HttpError`, `data(…, { status })`, or
 * `new Response(…, { status })` (all normalized to `HttpError`), or any
 * object with React Router's `ErrorResponse` shape.
 */
export declare function isRouteErrorResponse(value: unknown): value is HttpError;
export declare function isRedirect(value: unknown): value is Response;
export declare function isHttpError(value: unknown): value is HttpError;
export declare function isBractJSError(value: unknown): value is BractJSError;
export declare function httpStatusText(status: number): string;
export { DefaultErrorBoundary, RouteErrorBoundary } from "./error-boundary.tsx";
