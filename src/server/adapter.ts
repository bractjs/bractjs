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

/**
 * Default adapter — wraps `Bun.serve()`.
 * Created internally by `createServer()` when no adapter is provided.
 */
export class BunAdapter implements BractAdapter {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private handler: ((request: Request) => Promise<Response>) | null = null;

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
      fetch: handler,
      error(err: Error) {
        console.error("[bractjs] unhandled server error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
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
