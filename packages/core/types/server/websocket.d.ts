import { type MiddlewareContext, type MiddlewareFn } from "./middleware.ts";
/** One connection. The same shape on Bun and Deno. */
export interface BractWebSocket<Data = unknown> {
    /** What `upgrade()` returned for this connection. */
    readonly data: Data;
    send(message: string | ArrayBuffer | Uint8Array): void;
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
export declare function websocket<Data = undefined>(path: string, handlers: WebSocketHandlers<Data>, options?: WebSocketOptions): void;
/** True when any endpoint is registered (Node.js refuses to start then). */
export declare function hasWebSocketEndpoints(): boolean;
/** Tests and hot reload. */
export declare function clearWebSocketEndpoints(): void;
/** An adapter's upgrade for one request. Returns false when the runtime refused it. */
export type Upgrader = (connection: {
    handlers: WebSocketHandlers<unknown>;
    data: unknown;
}) => boolean;
/** Adapters: make `request` upgradable (call before handing it to the fetch handler). */
export declare function registerUpgrader(request: Request, upgrade: Upgrader): void;
/** Adapters: the wrapper handed to an endpoint's open/message/close. */
export declare function wrapSocket<Data>(raw: {
    send(m: string | ArrayBuffer | Uint8Array): unknown;
    close(code?: number, reason?: string): unknown;
}, data: Data): BractWebSocket<Data>;
/** Adapters: run a handler, logging (never throwing) on failure. */
export declare function runSocketHandler(what: string, fn: () => unknown): void;
/**
 * Returned by the fetch handler once the adapter upgraded the connection. The
 * adapter answers the handshake itself and ignores this response (it only
 * travels back through the middleware chain).
 */
export declare function upgradedResponse(): Response;
/**
 * Handle a WebSocket handshake for a registered endpoint, or return null
 * (not a handshake, or no endpoint at that path).
 */
export declare function handleWebSocketRequest(request: Request, 
/** The request's context from global middleware. */
context?: Record<string, unknown>): Promise<Response | null>;
