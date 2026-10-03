import { setClientAddress } from "./client-address.ts";
import { isExplicitDev } from "./env.ts";

// ── BractAdapter ──────────────────────────────────────────────────────────

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

// ── BunAdapter ────────────────────────────────────────────────────────────

// SECURITY(medium): hard ceiling on request body size at the server boundary,
// independent of any Content-Length the client advertises. The per-route and
// /_action handlers apply their own (smaller) caps and double-check the decoded
// size, but this is the single backstop every code path inherits — it bounds
// memory even for paths that don't pre-check (e.g. an app's own /api handler
// that reads request.formData() directly). Sits above the 10 MiB route-form
// cap so legitimate uploads still pass; raise it via the `maxRequestBodySize`
// config for apps with a dedicated large-upload endpoint.
export const DEFAULT_MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024; // 16 MiB

/**
 * Default adapter — wraps `Bun.serve()`.
 * Created internally by `createServer()` when no adapter is provided.
 */
export class BunAdapter implements BractAdapter {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private handler: ((request: Request) => Promise<Response>) | null = null;
  private maxRequestBodySize: number;
  private hostname: string | undefined;

  /** `hostname` omitted → Bun's default (all interfaces). */
  constructor(maxRequestBodySize: number = DEFAULT_MAX_REQUEST_BODY_BYTES, hostname?: string) {
    this.maxRequestBodySize = maxRequestBodySize;
    this.hostname = hostname;
  }

  setHandler(handler: (request: Request) => Promise<Response>): void {
    this.handler = handler;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.handler) throw new Error("BunAdapter: handler not set");
    return this.handler(request);
  }

  listen(port: number): void {
    if (!this.handler) throw new Error("BunAdapter: handler not set before listen()");
    const handler = this.handler;
    this.server = Bun.serve({
      port,
      ...(this.hostname ? { hostname: this.hostname } : {}),
      maxRequestBodySize: this.maxRequestBodySize,
      fetch(request, server) {
        // Record the socket address for getClientAddress() (rate limiting, logs).
        const address = server.requestIP(request)?.address;
        if (address) setClientAddress(request, address);
        return handler(request);
      },
      error(err: Error) {
        console.error("[bractjs] unhandled server error:", err);
        // SECURITY(high): never leak internal error details in production. This
        // is a last-resort backstop (buildFetchHandler already catches request
        // errors) — mirror the isExplicitDev() gating used on every other path.
        const message = isExplicitDev() ? err.message : "Internal Server Error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      },
    });
  }

  stop(): void {
    this.server?.stop();
  }
}
