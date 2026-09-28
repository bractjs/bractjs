import {
  type Deferred,
  DEFERRED_WIRE_KEY,
  isDeferred,
  mapLoaderFields,
  type SettledDeferred,
} from "../shared/deferred.ts";
import { isHttpError } from "../shared/errors.ts";
import { isExplicitDev, safeStringify } from "./env.ts";

// Server half of the defer() transport (wire format: shared/deferred.ts).

async function settle(d: Deferred<unknown>): Promise<SettledDeferred> {
  try {
    return { ok: true, value: await d.promise };
  } catch (err) {
    // Same exposure policy as loader errors: an HttpError's message is meant
    // for users; anything else is generic outside development.
    if (isHttpError(err)) return { ok: false, error: { message: err.message, status: err.status } };
    console.error("[bractjs] deferred loader data rejected:", err);
    return {
      ok: false,
      error: { message: isExplicitDev() && err instanceof Error ? err.message : "Internal Server Error" },
    };
  }
}

/**
 * Document path: replace each Deferred with an id marker for the SSR data
 * island. Returns the ids to settle and send after the HTML stream (see
 * appendDeferredScript). The same Deferred always gets the same id, so a value
 * shared by `loaderData` and `matches` resolves once.
 */
export function encodeDeferred(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  pending: Array<[string, Deferred<unknown>]>;
} {
  const ids = new Map<Deferred<unknown>, string>();
  const encoded = mapLoaderFields(payload, (value) => {
    if (!isDeferred(value)) return value;
    let id = ids.get(value);
    if (!id) {
      id = `d${ids.size}`;
      ids.set(value, id);
    }
    return { [DEFERRED_WIRE_KEY]: id };
  });
  return { payload: encoded, pending: [...ids].map(([d, id]) => [id, d]) };
}

/** `/_data` path: wait for every Deferred and inline its settled value. */
export async function settleDeferred(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const found = new Set<Deferred<unknown>>();
  mapLoaderFields(payload, (value) => {
    if (isDeferred(value)) found.add(value);
    return value;
  });
  if (found.size === 0) return payload;
  const settled = new Map(await Promise.all([...found].map(async (d) => [d, await settle(d)] as const)));
  return mapLoaderFields(payload, (value) =>
    isDeferred(value) ? { [DEFERRED_WIRE_KEY]: settled.get(value) } : value,
  );
}

/**
 * Pass React's HTML stream through, then append one inline script carrying
 * every deferred value once they settle. The visible content already streamed
 * progressively via <Await>'s server-side Suspense boundaries; this script
 * only hands the values to the client. React loads the client entry as an
 * `async` module, so hydration may start before or after this script runs —
 * the client side (deferred-revive.ts) handles both orders.
 */
export function appendDeferredScript(
  stream: ReadableStream<Uint8Array>,
  pending: Array<[string, Deferred<unknown>]>,
  nonce?: string,
): ReadableStream<Uint8Array> {
  if (pending.length === 0) return stream;
  // Start settling now: an unobserved rejection must not surface as unhandled
  // while React is still streaming.
  const results = Promise.all(pending.map(async ([id, d]) => [id, await settle(d)] as const));
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (!done) {
        controller.enqueue(value);
        return;
      }
      const calls = (await results)
        .map(([id, r]) => `r(${JSON.stringify(id)},${safeStringify(r)});`)
        .join("");
      const nonceAttr = nonce ? ` nonce="${nonce.replace(/"/g, "&quot;")}"` : "";
      // Works whichever runs first: if the client already installed
      // __BRACTJS_RESOLVE__ it receives the value, otherwise the value waits
      // in __BRACTJS_DEFERRED__ for the client to pick up.
      controller.enqueue(
        new TextEncoder().encode(
          `<script${nonceAttr}>(function(r){${calls}})(self.__BRACTJS_RESOLVE__||function(i,v){(self.__BRACTJS_DEFERRED__=self.__BRACTJS_DEFERRED__||{})[i]=v});</script>`,
        ),
      );
      controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
