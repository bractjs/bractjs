/**
 * Minimal interface that adapters must implement.
 *
 * `fetch` is the standard WinterCG-compatible fetch handler — it receives a
 * Request and returns a Response.  The server core calls this for every
 * incoming HTTP request after routing special endpoints.
 *
 * `listen` starts the adapter's underlying server on the given port.
 * It is optional for environments that do not control port binding (e.g.
 * Cloudflare Workers).
 */
export interface BractAdapter {
    fetch(request: Request): Promise<Response>;
    listen?(port: number): void;
}
export declare class BunAdapter implements BractAdapter {
    private server;
    private handler;
    private maxRequestBodySize;
    constructor(maxRequestBodySize?: number);
    setHandler(handler: (request: Request) => Promise<Response>): void;
    fetch(request: Request): Promise<Response>;
    listen(port: number): void;
    stop(): void;
}
