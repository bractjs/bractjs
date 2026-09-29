import { HttpError } from "./errors.ts";
declare const BRAND: unique symbol;
export declare class DataWithResponseInit<T> {
    readonly data: T;
    readonly init: ResponseInit | null;
    readonly type: "DataWithResponseInit";
    readonly [BRAND] = true;
    constructor(data: T, init: ResponseInit | null);
}
/** Return (or throw) loader/action data with a status and/or headers. */
export declare function data<T>(value: T, init?: number | ResponseInit): DataWithResponseInit<T>;
export declare function isDataWithResponseInit(value: unknown): value is DataWithResponseInit<unknown>;
/**
 * Normalize React Router's thrown error responses into an {@link HttpError}:
 * `throw new Response("Not Found", { status: 404 })` and
 * `throw data("Not Found", { status: 404 })`. Returns null for anything else
 * (including redirects — those stay control flow).
 */
export declare function toHttpError(err: unknown): Promise<HttpError | null>;
export {};
