import { Deferred, DEFERRED_WIRE_KEY, mapLoaderFields, type SettledDeferred } from "../shared/deferred.ts";
import { HttpError } from "../shared/errors.ts";

// Client half of the defer() transport (wire format: shared/deferred.ts).

interface DeferredGlobals {
  __BRACTJS_DEFERRED__?: Record<string, SettledDeferred>;
  __BRACTJS_RESOLVE__?: (id: string, result: SettledDeferred) => void;
}

/** React 19's `use()` reads these to unwrap an already-settled promise synchronously. */
type TrackedPromise = Promise<unknown> & { status?: string; value?: unknown; reason?: unknown };

function toError(error: { message: string; status?: number }): Error {
  return error.status ? new HttpError(error.status, error.message) : new Error(error.message);
}

/** A promise already marked settled, so hydration renders it without suspending. */
function settledPromise(result: SettledDeferred): Promise<unknown> {
  if (result.ok) {
    const p: TrackedPromise = Promise.resolve(result.value);
    p.status = "fulfilled";
    p.value = result.value;
    return p;
  }
  const reason = toError(result.error);
  const p: TrackedPromise = Promise.reject(reason);
  p.catch(() => {}); // surfaced through <Await>, not as an unhandled rejection
  p.status = "rejected";
  p.reason = reason;
  return p;
}

// Ids are only unique within one document, so the promise cache belongs to
// the value store the document's script writes into.
let cacheStore: Record<string, SettledDeferred> | undefined;
const byId = new Map<string, Promise<unknown>>();
const waiting = new Map<string, (result: SettledDeferred) => void>();

/** The promise for a document-streamed value, whether or not it has arrived yet. */
function fromDocument(id: string): Promise<unknown> {
  const g = globalThis as DeferredGlobals;
  const store = (g.__BRACTJS_DEFERRED__ ??= {});
  if (store !== cacheStore) {
    cacheStore = store;
    byId.clear();
    waiting.clear();
    g.__BRACTJS_RESOLVE__ = (key, result) => {
      store[key] = result;
      waiting.get(key)?.(result);
      waiting.delete(key);
    };
  }
  const cached = byId.get(id);
  if (cached) return cached;
  const promise = store[id]
    ? settledPromise(store[id])
    : new Promise<SettledDeferred>((resolve) => waiting.set(id, resolve)).then((r) =>
        r.ok ? r.value : Promise.reject(toError(r.error)),
      );
  byId.set(id, promise);
  return promise;
}

/** Turn wire markers in a loader payload back into Deferred values for <Await>. Idempotent. */
export function reviveDeferred<T>(payload: T): T {
  return mapLoaderFields(payload, (value) => {
    if (!value || typeof value !== "object" || !(DEFERRED_WIRE_KEY in value)) return value;
    const marker = (value as Record<string, unknown>)[DEFERRED_WIRE_KEY];
    return new Deferred(
      typeof marker === "string" ? fromDocument(marker) : settledPromise(marker as SettledDeferred),
    );
  });
}
