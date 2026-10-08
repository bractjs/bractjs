import { matchPath } from "./api-route.ts";
import { isSameOriginHandshake } from "./csrf.ts";
import {
  createMiddlewareContext,
  type MiddlewareContext,
  type MiddlewareFn,
  runRouteMiddleware,
} from "./middleware.ts";

// WebSocket endpoints for app code, on Bun and Deno.
//
// `websocket(path, handlers)` registers an endpoint at import time, like
// `route()`. A handshake for it goes through the global pipeline like any
// request; dispatch (serve.ts → handleWebSocketRequest) checks the Origin,
// runs the endpoint's middleware and `upgrade()`, then asks the ADAPTER to
// upgrade: each adapter registers an upgrader for the requests it serves
// (registerUpgrader). The adapter then answers the handshake itself, so no
// middleware ever has to handle a 101 response.

/** One connection. The same shape on Bun and Deno. */
export interface BractWebSocket<Data = unknown> {
  /** What `upgrade()` returned for this connection. */
  readonly data: Data;
  /**
   * Send a message. `true` when the runtime accepted it (on Bun it may be
   * queued under backpressure — see `bufferedAmount()`), `false` when it was
   * dropped: the socket is closing or closed.
   */
  send(message: string | ArrayBuffer | Uint8Array): boolean;
  /** Bytes queued but not yet sent: throttle producers while this grows. */
  bufferedAmount(): number;
  close(code?: number, reason?: string): void;
  /** The runtime's own socket (Bun's ServerWebSocket, Deno's WebSocket). */
  readonly raw: unknown;
}

export interface WebSocketHandlers<Data = unknown> {
  /**
   * Runs before the upgrade, after the endpoint's middleware: authenticate
   * here. Return a `Response` to refuse (e.g. 401), or the per-connection
   * `data` (a user id, a room). Default: `undefined` data.
   */
  upgrade?(ctx: MiddlewareContext): Data | Response | Promise<Data | Response>;
  open?(ws: BractWebSocket<Data>): void | Promise<void>;
  message?(ws: BractWebSocket<Data>, message: string | ArrayBuffer): void | Promise<void>;
  close?(ws: BractWebSocket<Data>, code: number, reason: string): void | Promise<void>;
}

export interface WebSocketOptions {
  /** Endpoint middleware, run after global middleware (auth, rate limits). */
  middleware?: MiddlewareFn[];
}

interface Endpoint {
  path: string;
  handlers: WebSocketHandlers<unknown>;
  middleware: MiddlewareFn[];
}

const endpoints: Endpoint[] = [];

/**
 * A WebSocket endpoint at `path` (`:param` segments allowed). The defining
 * module must be imported from `app/root.tsx` or `app/server.ts`, as for
 * `route()`. Runs on Bun and Deno; a Node.js server refuses to start with one.
 *
 *   websocket("/ws/chat", {
 *     upgrade: async ({ request }) => (await getUser(request)) ?? new Response("Unauthorized", { status: 401 }),
 *     message(ws, text) { ws.send(`${ws.data.name}: ${text}`); },
 *   });
 */
export function websocket<Data = undefined>(
  path: string,
  handlers: WebSocketHandlers<Data>,
  options: WebSocketOptions = {},
): void {
  if (!path.startsWith("/"))
    throw new Error(`[bractjs] websocket(): path must start with "/", got ${JSON.stringify(path)}`);
  const endpoint: Endpoint = {
    path,
    handlers: handlers as WebSocketHandlers<unknown>,
    middleware: options.middleware ?? [],
  };
  // A dev re-import replaces the endpoint instead of shadowing it.
  const existing = endpoints.findIndex((e) => e.path === path);
  if (existing >= 0) endpoints[existing] = endpoint;
  else endpoints.push(endpoint);
}

/** True when any endpoint is registered (Node.js refuses to start then). */
export function hasWebSocketEndpoints(): boolean {
  return endpoints.length > 0;
}

/** Tests and hot reload. */
export function clearWebSocketEndpoints(): void {
  endpoints.length = 0;
}

// ── Adapter side ────────────────────────────────────────────────────────────

/** An adapter's upgrade for one request. Returns false when the runtime refused it. */
export type Upgrader = (connection: { handlers: WebSocketHandlers<unknown>; data: unknown }) => boolean;

const upgraders = new WeakMap<Request, Upgrader>();

/** Adapters: make `request` upgradable (call before handing it to the fetch handler). */
export function registerUpgrader(request: Request, upgrade: Upgrader): void {
  upgraders.set(request, upgrade);
}

/** Adapters: the wrapper handed to an endpoint's open/message/close. */
export function wrapSocket<Data>(
  raw: {
    send(m: string | ArrayBuffer | Uint8Array): unknown;
    close(code?: number, reason?: string): unknown;
    /** Bun's ServerWebSocket. */
    getBufferedAmount?(): number;
    /** Deno's (standard) WebSocket. */
    readonly bufferedAmount?: number;
    /** 0 connecting, 1 open, 2 closing, 3 closed (both runtimes). */
    readonly readyState?: number;
  },
  data: Data,
): BractWebSocket<Data> {
  return {
    data,
    raw,
    send: (message) => {
      // A closing/closed standard WebSocket (Deno) discards silently rather
      // than throwing, so ask it first. Bun returns a status (-1 queued under
      // backpressure, 0 dropped, >0 bytes sent); a not-yet-open socket throws
      // InvalidStateError. A TypeError (unsupported message type) is a bug in
      // the caller and still surfaces.
      if (typeof raw.readyState === "number" && raw.readyState !== 1) return false;
      try {
        const status = raw.send(message);
        return typeof status === "number" ? status !== 0 : true;
      } catch (err) {
        if (err instanceof TypeError) throw err;
        return false;
      }
    },
    bufferedAmount: () =>
      typeof raw.getBufferedAmount === "function" ? raw.getBufferedAmount() : (raw.bufferedAmount ?? 0),
    close: (code, reason) => void raw.close(code, reason),
  };
}

/** Adapters: run a handler, logging (never throwing) on failure. */
export function runSocketHandler(what: string, fn: () => unknown): void {
  try {
    const out = fn();
    if (out instanceof Promise)
      out.catch((err) => console.error(`[bractjs] websocket ${what} handler error:`, err));
  } catch (err) {
    console.error(`[bractjs] websocket ${what} handler error:`, err);
  }
}

/**
 * Returned by the fetch handler once the adapter upgraded the connection. The
 * adapter answers the handshake itself and ignores this response (it only
 * travels back through the middleware chain).
 */
export function upgradedResponse(): Response {
  return new Response(null, { status: 200, headers: { "X-BractJS-WebSocket": "upgraded" } });
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Handle a WebSocket handshake for a registered endpoint, or return null
 * (not a handshake, or no endpoint at that path).
 */
export async function handleWebSocketRequest(
  request: Request,
  /** The request's context from global middleware. */
  context: Record<string, unknown> = {},
): Promise<Response | null> {
  if (endpoints.length === 0) return null;
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return null;
  const { pathname } = new URL(request.url);
  let endpoint: Endpoint | undefined;
  let params: Record<string, string> | null = null;
  for (const e of endpoints) {
    params = matchPath(e.path, pathname);
    if (params) {
      endpoint = e;
      break;
    }
  }
  if (!endpoint || !params) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  if (!isSameOriginHandshake(request))
    return new Response("Forbidden: cross-origin WebSocket", { status: 403 });

  const upgrade = upgraders.get(request);
  if (!upgrade) {
    return new Response("WebSockets need a Bun or Deno server", { status: 501 });
  }
  const ep = endpoint;
  const ctx = createMiddlewareContext(request, params, context);
  return runRouteMiddleware(ep.middleware, ctx, async () => {
    const data = ep.handlers.upgrade ? await ep.handlers.upgrade(ctx) : undefined;
    if (data instanceof Response) return data;
    if (!upgrade({ handlers: ep.handlers, data })) {
      return new Response("Upgrade Required", { status: 426, headers: { Upgrade: "websocket" } });
    }
    return upgradedResponse();
  });
}
