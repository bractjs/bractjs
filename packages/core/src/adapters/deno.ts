// Deno adapter: serves a BractJS fetch handler with `Deno.serve`.
// `createServer()` picks it automatically when it runs on Deno.
import type { BractAdapter } from "../server/adapter.ts";
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
}

export class DenoAdapter implements BractAdapter {
  private handler: ((request: Request) => Promise<Response>) | null = null;
  private server: DenoHttpServer | null = null;
  private readonly hostname: string | undefined;

  constructor(options: DenoAdapterOptions = {}) {
    this.hostname = options.hostname;
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
      setClientAddress(request, info.remoteAddr.hostname);
      return this.fetch(request);
    });
  }

  stop(): void {
    void this.server?.shutdown();
  }
}

/** `createServer({ adapter: createDenoAdapter() })` — or let createServer pick it on Deno. */
export function createDenoAdapter(options?: DenoAdapterOptions): DenoAdapter {
  return new DenoAdapter(options);
}
