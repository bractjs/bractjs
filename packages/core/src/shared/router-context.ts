// Typed context keys (React Router 7.9+/8 `createContext` + `RouterContextProvider`).
//
// BractJS's `context` bag has always been a plain mutable object that
// middleware writes fields onto (`ctx.context.user = …`). React Router moved to
// typed keys: `const userContext = createContext<User>()`, then
// `context.set(userContext, user)` in middleware and `context.get(userContext)`
// in loaders. Both styles work on the same object: `get`/`set` are attached as
// NON-enumerable methods backed by a hidden Map, so spreading, JSON-logging or
// `Object.keys(context)` see only the string fields they always saw.

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
export function createContext<T>(defaultValue?: T): RouterContext<T> {
  return Object.freeze({ defaultValue });
}

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

const STORE = Symbol.for("bractjs.contextStore");

type WithStore = Record<string | symbol, unknown> & { [STORE]?: Map<RouterContext<unknown>, unknown> };

function getStore(obj: WithStore): Map<RouterContext<unknown>, unknown> {
  return obj[STORE] as Map<RouterContext<unknown>, unknown>;
}

/**
 * Give `obj` the typed `get`/`set` accessors (idempotent). Pass `inherit` to
 * share an existing object's typed values — used when a per-route context
 * factory merges its result into a NEW object, which must still see what
 * middleware `set()` on the original.
 */
export function withContextAccessors<T extends Record<string, unknown>>(
  obj: T,
  inherit?: Record<string, unknown>,
): T & ContextAccessors {
  const target = obj as unknown as WithStore;
  if (target[STORE]) return obj as T & ContextAccessors;
  const parent = inherit as WithStore | undefined;
  const store = parent?.[STORE] ?? new Map<RouterContext<unknown>, unknown>();
  Object.defineProperty(target, STORE, { value: store, enumerable: false, configurable: true });
  // Only define methods the object doesn't already own as data, so an app that
  // stored its own `context.get` field keeps it.
  if (!Object.prototype.hasOwnProperty.call(target, "get")) {
    Object.defineProperty(target, "get", {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function get<V>(key: RouterContext<V>): V {
        const s = getStore(target);
        if (s.has(key as RouterContext<unknown>)) return s.get(key as RouterContext<unknown>) as V;
        if (key.defaultValue !== undefined) return key.defaultValue;
        throw new Error("[bractjs] No value found for context — set it in middleware before reading it.");
      },
    });
  }
  if (!Object.prototype.hasOwnProperty.call(target, "set")) {
    Object.defineProperty(target, "set", {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function set<V>(key: RouterContext<V>, value: V): void {
        getStore(target).set(key as RouterContext<unknown>, value);
      },
    });
  }
  return obj as T & ContextAccessors;
}

/**
 * React Router's context container, for code that constructs one explicitly
 * (tests, custom adapters): `new RouterContextProvider()`. Instances are plain
 * BractJS context objects — string fields and typed keys both work.
 */
export class RouterContextProvider implements ContextAccessors {
  // String fields, as on every BractJS context object.
  [key: string]: unknown;
  // Installed per instance by withContextAccessors (non-enumerable); `declare`
  // so no class-field initializer overwrites them.
  declare get: <T>(key: RouterContext<T>) => T;
  declare set: <T>(key: RouterContext<T>, value: T) => void;

  /**
   * @param init Typed values (`Map<RouterContext, value>`, React Router's
   *   form) or plain string-keyed fields (`{ user }`, BractJS's form).
   */
  constructor(init?: Map<RouterContext<unknown>, unknown> | Record<string, unknown>) {
    withContextAccessors(this as unknown as Record<string, unknown>);
    if (init instanceof Map) for (const [k, v] of init) (this as unknown as ContextAccessors).set(k, v);
    else if (init) Object.assign(this, init);
  }
}
