export declare class BractJSError extends Error {
    readonly status: number;
    constructor(message: string, status?: number);
}
export declare class HttpError extends BractJSError {
    constructor(status: number, message?: string);
}
export declare function isRedirect(value: unknown): value is Response;
export declare function isHttpError(value: unknown): value is HttpError;
export declare function isBractJSError(value: unknown): value is BractJSError;
export { DefaultErrorBoundary, RouteErrorBoundary } from "./error-boundary.tsx";
