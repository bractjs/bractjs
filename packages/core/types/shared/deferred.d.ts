declare const DEFERRED_MARKER: unique symbol;
export declare class Deferred<T> {
    readonly promise: Promise<T>;
    readonly [DEFERRED_MARKER]: true;
    constructor(promise: Promise<T>);
}
export type DeferredData<T extends Record<string, unknown>> = {
    [K in keyof T]: T[K] extends Promise<infer V> ? Deferred<V> : T[K];
};
export declare function defer<T extends Record<string, unknown>>(data: T): DeferredData<T>;
export declare function isDeferred<T>(value: unknown): value is Deferred<T>;
/** Returns only the already-resolved (non-Promise) values from a DeferredData object. */
export declare function stripDeferred<T extends Record<string, unknown>>(data: T): Record<string, unknown>;
/** Returns only the deferred promises from a DeferredData object, keyed by field name. */
export declare function promisesOf<T extends Record<string, unknown>>(data: T): Record<string, Promise<unknown>>;
export {};
