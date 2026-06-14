const DEFERRED_MARKER = Symbol("bract.deferred");

export class Deferred<T> {
  readonly promise: Promise<T>;
  readonly [DEFERRED_MARKER] = true as const;

  constructor(promise: Promise<T>) {
    this.promise = promise;
  }
}

export type DeferredData<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends Promise<infer V> ? Deferred<V> : T[K];
};

export function defer<T extends Record<string, unknown>>(
  data: T
): DeferredData<T> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(data)) {
    const value = data[key];
    result[key] =
      value instanceof Promise ? new Deferred(value) : value;
  }

  return result as DeferredData<T>;
}

export function isDeferred<T>(value: unknown): value is Deferred<T> {
  return value instanceof Deferred;
}

/** Returns only the already-resolved (non-Promise) values from a DeferredData object. */
export function stripDeferred<T extends Record<string, unknown>>(
  data: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!isDeferred(data[key])) result[key] = data[key];
  }
  return result;
}

/** Returns only the deferred promises from a DeferredData object, keyed by field name. */
export function promisesOf<T extends Record<string, unknown>>(
  data: T
): Record<string, Promise<unknown>> {
  const result: Record<string, Promise<unknown>> = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (isDeferred(value)) result[key] = (value as Deferred<unknown>).promise;
  }
  return result;
}
