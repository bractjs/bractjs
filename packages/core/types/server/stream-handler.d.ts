/**
 * Handles `GET /_stream?id=<actionId>` requests.
 *
 * The action identified by `id` must be an async generator function registered
 * in the action registry.  Each yielded value is sent as an SSE `data` event.
 * The stream closes when the generator returns.
 *
 * Security: only IDs present in the registry are resolved — no path traversal.
 */
export declare function handleStreamRequest(request: Request): Promise<Response | null>;
