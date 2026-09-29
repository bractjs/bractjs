/** A typed context key. Create with {@link createContext}; read/write with `context.get`/`context.set`. */
export interface RouterContext<T = unknown> {
    readonly defaultValue?: T;
    /** Brand — keeps `RouterContext<A>` and `RouterContext<B>` apart at the type level. */
    readonly __type?: T;
}
/**
 * Create a typed context key. Pass a default to make `context.get(key)` return
 * it when nothing was set; without one, reading an unset key throws (a
 * middleware that should have run didn't — failing loudly beats `undefined`).
 *
 * ```ts
 * export const userContext = createContext<User | null>(null);
 * // middleware: context.set(userContext, await getUser(request));
 * // loader:     const user = context.get(userContext);
 * ```
 */
export declare function createContext<T>(defaultValue?: T): RouterContext<T>;
/** The typed accessors every BractJS `context` object carries. */
export interface ContextAccessors {
    get<T>(key: RouterContext<T>): T;
    set<T>(key: RouterContext<T>, value: T): void;
}
/**
 * The `context` handed to middleware, `beforeLoad`, loaders and actions: the
 * classic string-keyed bag plus React Router's typed `get`/`set`.
 */
export type RouteContext = Record<string, unknown> & ContextAccessors;
/**
 * Give `obj` the typed `get`/`set` accessors (idempotent). Pass `inherit` to
 * share an existing object's typed values — used when a per-route context
 * factory merges its result into a NEW object, which must still see what
 * middleware `set()` on the original.
 */
export declare function withContextAccessors<T extends Record<string, unknown>>(obj: T, inherit?: Record<string, unknown>): T & ContextAccessors;
/**
 * React Router's context container, for code that constructs one explicitly
 * (tests, custom adapters): `new RouterContextProvider()`. Instances are plain
 * BractJS context objects — string fields and typed keys both work.
 */
export declare class RouterContextProvider implements ContextAccessors {
    [key: string]: unknown;
    get: <T>(key: RouterContext<T>) => T;
    set: <T>(key: RouterContext<T>, value: T) => void;
    /**
     * @param init Typed values (`Map<RouterContext, value>`, React Router's
     *   form) or plain string-keyed fields (`{ user }`, BractJS's form).
     */
    constructor(init?: Map<RouterContext<unknown>, unknown> | Record<string, unknown>);
}
