import { resolveAction } from "./action-registry.ts";
import { isExplicitDev } from "./env.ts";
import { csrfHint } from "./csrf.ts";

// ── SSE helpers ────────────────────────────────────────────────────────────

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
export async function handleStreamRequest(request: Request): Promise<Response | null> {
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

  const action = resolveAction(actionId);
  if (!action) {
    return new Response(sseChunk("error", { message: "Action not found" }), {
      status: 404,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
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
          // SECURITY(medium): no per-stream yield cap. A malicious or buggy
          // generator that yields forever holds a connection open and pegs
          // serialization CPU. The Bun.serve runtime aborts when the client
          // disconnects, so the worst case is a slow attacker keeping their
          // own connection open — bounded by OS fd limits, not memory.
          // Apps wanting hard bounds should wrap their generator with a
          // count/time limit before exporting it as an action.
          for await (const value of result as AsyncIterable<unknown>) {
            controller.enqueue(encoder.encode(sseChunk("data", value)));
          }
        } else {
          // Plain return value: emit once then close.
          controller.enqueue(encoder.encode(sseChunk("data", result)));
        }
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } catch (err) {
        // Never expose internal error details to clients in production.
        const message = isExplicitDev()
          ? (err instanceof Error ? err.message : String(err))
          : "Internal server error";
        console.error("[bractjs] stream action error:", err);
        controller.enqueue(encoder.encode(sseChunk("error", { message })));
      } finally {
        controller.close();
      }
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
