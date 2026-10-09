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

export function defer<T extends Record<string, unknown>>(data: T): DeferredData<T> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value instanceof Promise) {
      // Mark the rejection handled now. The server only subscribes (settle)
      // once every loader has finished and the shell has rendered; a promise
      // that rejects before then would otherwise surface as an unhandled
      // rejection — on Node (appFetchHandler) that terminates the process.
      // The derived promise is dropped; consumers still see the rejection.
      value.catch(() => {});
      result[key] = new Deferred(value);
    } else {
      result[key] = value;
    }
  }

  return result as DeferredData<T>;
}

export function isDeferred<T>(value: unknown): value is Deferred<T> {
  return value instanceof Deferred;
}

/** Returns only the already-resolved (non-Promise) values from a DeferredData object. */
export function stripDeferred<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!isDeferred(data[key])) result[key] = data[key];
  }
  return result;
}

/** Returns only the deferred promises from a DeferredData object, keyed by field name. */
export function promisesOf<T extends Record<string, unknown>>(data: T): Record<string, Promise<unknown>> {
  const result: Record<string, Promise<unknown>> = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (isDeferred(value)) result[key] = (value as Deferred<unknown>).promise;
  }
  return result;
}

// ── Wire format ─────────────────────────────────────────────────────────────
//
// A Deferred can't be JSON-serialized, so loader payloads carry a marker in
// its place: `{ __bractDeferred: "d0" }` in the SSR data island (the settled
// value follows at the end of the HTML stream), or `{ __bractDeferred:
// { ok, value | error } }` in `/_data` JSON (settled before sending). The
// client turns markers back into Deferred values (client/deferred-revive.ts).

export const DEFERRED_WIRE_KEY = "__bractDeferred";

export type SettledDeferred =
  { ok: true; value: unknown } | { ok: false; error: { message: string; status?: number } };

/**
 * Apply `fn` to every top-level field of each loader slice in a payload —
 * `root`, `route`, `layouts[]`, and `matches[].data` (defer() only wraps
 * top-level fields). Returns a copy with only changed slices replaced.
 */
export function mapLoaderFields<T>(payload: T, fn: (value: unknown) => unknown): T {
  if (!payload || typeof payload !== "object") return payload;
  const mapSlice = (slice: unknown): unknown => {
    if (!slice || typeof slice !== "object" || Array.isArray(slice)) return slice;
    let out: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(slice)) {
      const next = fn(value);
      if (next !== value) {
        out ??= { ...(slice as Record<string, unknown>) };
        out[key] = next;
      }
    }
    return out ?? slice;
  };
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  if ("root" in p) out.root = mapSlice(p.root);
  if ("route" in p) out.route = mapSlice(p.route);
  if (Array.isArray(p.layouts)) out.layouts = p.layouts.map(mapSlice);
  if (Array.isArray(p.matches)) {
    out.matches = p.matches.map((m) =>
      m && typeof m === "object" ? { ...m, data: mapSlice((m as { data?: unknown }).data) } : m,
    );
  }
  return out as T;
}
