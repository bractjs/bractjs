// Namespace import, as in request-context.ts: the client build resolves this
// graph through the package barrel, where node:async_hooks is an empty shim.
import * as asyncHooks from "node:async_hooks";
import { type ActionGateOptions, runActionGate } from "./action-handler.ts";
import { toHttpError } from "../shared/data.ts";
import { isHttpError, isRedirect } from "../shared/errors.ts";
import { sanitizeRedirect } from "./response.ts";
import { resolveActionEntry } from "./action-registry.ts";
import { csrfHint } from "./csrf.ts";
import { isExplicitDev } from "./env.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";

// ── SSE helpers ────────────────────────────────────────────────────────────

function sseChunk(event: string, data: unknown): string {
  // `undefined` (a bare `yield`) has no JSON form; send null so the client can parse it.
  return `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
}

// ── Handler ────────────────────────────────────────────────────────────────

/**
 * Handles `GET /_stream?id=<actionId>` requests.
 *
 * The action identified by `id` must be an async generator function registered
 * in the action registry.  Each yielded value is sent as an SSE `data` event.
 * The stream closes when the generator returns.
 *
 * Security: only IDs present in the registry are resolved — no path traversal.
 */
export async function handleStreamRequest(
  request: Request,
  gate?: ActionGateOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  // SECURITY(medium): exact-match prevents URL confusion.
  if (url.pathname !== "/_stream") return null;

  // SECURITY(high): /_stream invokes side-effecting server actions over GET.
  // GET can't carry a body and browsers issue cross-origin GETs from
  // <script>/<img>/<link rel=prefetch> *without* an Origin header, so a bare
  // same-origin-Origin gate is not enough here. Require the client-issued
  // X-BractJS-Action header outright: it's a custom header, so browsers block
  // it cross-origin without a CORS preflight, and the real client (useFetcher)
  // always sends it. This is strictly tighter than the /_action gate.
  if (!request.headers.get("X-BractJS-Action")) {
    return new Response(sseChunk("error", { message: isExplicitDev() ? csrfHint() : "Forbidden" }), {
      status: 403,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const actionId = url.searchParams.get("id");
  // Guard: reject missing or clearly invalid IDs before registry lookup.
  if (!actionId || !/^[0-9a-f]{16}$/.test(actionId)) {
    return new Response(sseChunk("error", { message: "Invalid action ID" }), {
      status: 400,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const entry = resolveActionEntry(actionId);
  if (!entry) {
    return new Response(sseChunk("error", { message: "Action not found" }), {
      status: 404,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // SECURITY(high): same route middleware as /_action (see action-middleware.ts).
  // It runs before the stream opens; a middleware rejection is the response.
  return runActionGate(request, entry, gate, async () => streamAction(entry.fn, request, gate?.onError));
}

/**
 * Run `fn` later in the async context that is current NOW (the request's:
 * getRequest(), request ids, tracing spans). The stream's pull() is invoked
 * by whatever reads the body, outside that context, and an async generator
 * resumes in its caller's context. Falls back to a direct call where the
 * runtime has no AsyncLocalStorage.snapshot().
 */
function captureContext(): <R>(fn: () => R) => R {
  const snapshot = (asyncHooks.AsyncLocalStorage as unknown as { snapshot?: () => <R>(fn: () => R) => R })
    ?.snapshot;
  return typeof snapshot === "function" ? snapshot() : (fn) => fn();
}

function streamAction(action: () => Promise<unknown>, request: Request, onError?: OnErrorHook): Response {
  const encoder = new TextEncoder();
  // Pull-driven: the generator advances one value per chunk the client reads,
  // so a slow reader is backpressure, not an ever-growing server-side queue;
  // a disconnect cancels the stream and runs the generator's `finally`.
  let iterator: AsyncIterator<unknown> | null = null;
  let single: { value: unknown } | null = null;
  let cancelled = false;
  let inContext: <R>(fn: () => R) => R = (fn) => fn();

  const fail = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
    err: unknown,
  ): Promise<void> => {
    // The client went away: there is no one to tell, and it is not a server error.
    if (cancelled) return;
    // Control flow, as on /_action: an HttpError / thrown error Response /
    // `data(…, { status })` carries its own status and message (never a
    // server error); a redirect reports its (origin-checked) location.
    if (isRedirect(err)) {
      const redirect = sanitizeRedirect(err, request.url).headers.get("Location");
      controller.enqueue(
        encoder.encode(sseChunk("error", { message: "Redirect", status: err.status, redirect })),
      );
      controller.close();
      return;
    }
    const httpError = isHttpError(err) ? err : await toHttpError(err);
    if (httpError) {
      controller.enqueue(
        encoder.encode(sseChunk("error", { message: httpError.message, status: httpError.status })),
      );
      controller.close();
      return;
    }
    // Never expose internal error details to clients in production.
    const message = isExplicitDev()
      ? err instanceof Error
        ? err.message
        : String(err)
      : "Internal server error";
    console.error("[bractjs] stream action error:", err);
    await fireOnError(onError, err, request);
    controller.enqueue(encoder.encode(sseChunk("error", { message })));
    controller.close();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      inContext = captureContext();
      try {
        // SECURITY(medium): /_stream invokes the resolved action with NO
        // caller-supplied arguments (GET carries no body, and we deliberately
        // pass none). Any function reachable here therefore runs purely on
        // server-side state. The X-BractJS-Action gate above blocks browser
        // cross-origin abuse; the action-registry's RESERVED_ROUTE_EXPORTS
        // filter keeps route lifecycle exports (loader/action/…) from ever
        // being resolvable. Authors must still ensure stream actions are safe
        // to call with no input and perform their own authorization.
        const result = await action();
        // If the action is an async generator, stream each value.
        if (result && typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
          // No per-stream yield cap: a generator that yields forever holds
          // its own connection open (bounded by fd limits, and by the client,
          // which can disconnect — that cancels it). Apps wanting hard bounds
          // should wrap their generator with a count/time limit.
          iterator = (result as AsyncIterable<unknown>)[Symbol.asyncIterator]();
          // The client may have gone while the action was still running: the
          // iterator then never gets a pull, so close it here.
          if (cancelled) {
            const it = iterator;
            iterator = null;
            if (it.return) await inContext(() => it.return!()).catch(() => {});
          }
        } else {
          // Plain return value: emit once then close.
          single = { value: result };
        }
      } catch (err) {
        await fail(controller, err);
      }
    },
    async pull(controller) {
      try {
        if (single) {
          const { value } = single;
          single = null;
          controller.enqueue(encoder.encode(sseChunk("data", value)));
          return;
        }
        if (iterator) {
          const it = iterator;
          const { done, value } = await inContext(() => it.next());
          if (cancelled) return;
          if (!done) {
            controller.enqueue(encoder.encode(sseChunk("data", value)));
            return;
          }
        }
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      } catch (err) {
        await fail(controller, err);
      }
    },
    async cancel() {
      cancelled = true;
      const it = iterator;
      iterator = null;
      // Let the generator clean up (its `finally` runs). Its own failure while
      // closing is not the client's concern.
      if (it?.return) await inContext(() => it.return!()).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
