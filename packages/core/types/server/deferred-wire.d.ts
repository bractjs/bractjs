import { type Deferred } from "../shared/deferred.ts";
/**
 * Document path: replace each Deferred with an id marker for the SSR data
 * island. Returns the ids to settle and send after the HTML stream (see
 * appendDeferredScript). The same Deferred always gets the same id, so a value
 * shared by `loaderData` and `matches` resolves once.
 */
export declare function encodeDeferred(payload: Record<string, unknown>): {
    payload: Record<string, unknown>;
    pending: Array<[string, Deferred<unknown>]>;
};
export declare function settleDeferred(payload: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>>;
/**
 * Pass React's HTML stream through, then append one inline script carrying
 * every deferred value once they settle. The visible content already streamed
 * progressively via <Await>'s server-side Suspense boundaries; this script
 * only hands the values to the client. React loads the client entry as an
 * `async` module, so hydration may start before or after this script runs —
 * the client side (deferred-revive.ts) handles both orders.
 */
export declare function appendDeferredScript(stream: ReadableStream<Uint8Array>, pending: Array<[string, Deferred<unknown>]>, nonce?: string, timeoutMs?: number): ReadableStream<Uint8Array>;
