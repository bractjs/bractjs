// Deno adapter: serves a BractJS fetch handler with `Deno.serve`.
// `createServer()` picks it automatically when it runs on Deno.
import { type BractAdapter, DEFAULT_MAX_REQUEST_BODY_BYTES } from "../server/adapter.ts";
import { setClientAddress } from "../server/client-address.ts";

interface DenoServeInfo {
  remoteAddr: { hostname: string };
}
interface DenoHttpServer {
  shutdown(): Promise<void>;
}
interface DenoNamespace {
  serve(
    options: { port: number; hostname?: string; onListen?: () => void },
    handler: (request: Request, info: DenoServeInfo) => Response | Promise<Response>,
  ): DenoHttpServer;
}

export interface DenoAdapterOptions {
  /** Interface to listen on. Default: all interfaces. */
  hostname?: string;
  /** Reject request bodies larger than this many bytes (413). Default 16 MiB, as on Bun. */
  maxRequestBodySize?: number;
}

export class DenoAdapter implements BractAdapter {
  private handler: ((request: Request) => Promise<Response>) | null = null;
  private server: DenoHttpServer | null = null;
  private readonly hostname: string | undefined;
  private readonly maxBody: number;

  constructor(options: DenoAdapterOptions = {}) {
    this.hostname = options.hostname;
    this.maxBody = options.maxRequestBodySize ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
  }

  setHandler(handler: (request: Request) => Promise<Response>): void {
    this.handler = handler;
  }

  fetch(request: Request): Promise<Response> {
    if (!this.handler) throw new Error("DenoAdapter: handler not set");
    return this.handler(request);
  }

  listen(port: number): void {
    const deno = (globalThis as { Deno?: DenoNamespace }).Deno;
    if (!deno) throw new Error("DenoAdapter: not running on Deno");
    if (!this.handler) throw new Error("DenoAdapter: handler not set before listen()");
    this.server = deno.serve({ port, hostname: this.hostname, onListen: () => {} }, (request, info) => {
      // Deno.serve has no body limit of its own: enforce the same backstop
      // Bun.serve and the Node adapter apply.
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > this.maxBody) {
        return new Response("Payload Too Large", {
          status: 413,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const capped = request.body ? limitBody(request, this.maxBody) : request;
      setClientAddress(capped, info.remoteAddr.hostname);
      return this.fetch(capped);
    });
  }

  stop(): void {
    void this.server?.shutdown();
  }
}

/**
 * `request` with its body counted as it streams, so a body without (or lying
 * about) Content-Length can't exceed the cap either.
 */
function limitBody(request: Request, maxBody: number): Request {
  let seen = 0;
  const body = request.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBody) controller.error(new Error("Payload Too Large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Request(request, { body, duplex: "half" } as RequestInit);
}

/** `createServer({ adapter: createDenoAdapter() })` — or let createServer pick it on Deno. */
export function createDenoAdapter(options?: DenoAdapterOptions): DenoAdapter {
  return new DenoAdapter(options);
}
