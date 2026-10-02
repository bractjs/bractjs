// Node.js adapter: serves a BractJS fetch handler with `node:http`.
// `createServer()` picks it automatically when it runs on Node (an app built
// with `bractjs build --target node`); pass it explicitly to configure it.
// Namespace imports: the package barrel reaches this file, and the client
// build checks named imports against node:* browser polyfills (no createServer
// there) before tree-shaking drops the module. See compression.ts.
import * as events from "node:events";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import * as http from "node:http";
import * as stream from "node:stream";
import type { BractAdapter } from "../server/adapter.ts";
import { setClientAddress } from "../server/client-address.ts";
import { isExplicitDev } from "../server/env.ts";

export interface NodeAdapterOptions {
  /** Interface to listen on. Default: all interfaces. */
  hostname?: string;
  /** Reject request bodies larger than this many bytes (413). Default 16 MiB, as on Bun. */
  maxRequestBodySize?: number;
}

const DEFAULT_MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;

export class NodeAdapter implements BractAdapter {
  private handler: ((request: Request) => Promise<Response>) | null = null;
  private server: Server | null = null;
  private readonly hostname: string | undefined;
  private readonly maxBody: number;

  constructor(options: NodeAdapterOptions = {}) {
    this.hostname = options.hostname;
    this.maxBody = options.maxRequestBodySize ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
  }

  setHandler(handler: (request: Request) => Promise<Response>): void {
    this.handler = handler;
  }

  fetch(request: Request): Promise<Response> {
    if (!this.handler) throw new Error("NodeAdapter: handler not set");
    return this.handler(request);
  }

  listen(port: number): void {
    if (!this.handler) throw new Error("NodeAdapter: handler not set before listen()");
    this.server = http.createServer((req, res) => {
      void this.respond(req, res);
    });
    this.server.listen(port, this.hostname);
  }

  stop(): void {
    this.server?.close();
    this.server?.closeAllConnections?.();
  }

  private async respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > this.maxBody) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" }).end("Payload Too Large");
      req.resume();
      return;
    }
    let response: Response;
    try {
      const request = toRequest(req, this.maxBody);
      if (req.socket.remoteAddress) setClientAddress(request, req.socket.remoteAddress);
      response = await this.fetch(request);
    } catch (err) {
      console.error("[bractjs] unhandled server error:", err);
      const message = isExplicitDev() && err instanceof Error ? err.message : "Internal Server Error";
      response = new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    await writeResponse(req, res, response);
  }
}

/** `createServer({ adapter: createNodeAdapter() })` — or let createServer pick it on Node. */
export function createNodeAdapter(options?: NodeAdapterOptions): NodeAdapter {
  return new NodeAdapter(options);
}

function toRequest(req: IncomingMessage, maxBody: number): Request {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  // Count bytes as they stream, so a body without (or lying about)
  // Content-Length can't exceed the cap either.
  let seen = 0;
  const body = (stream.Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBody) controller.error(new Error("Payload Too Large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Request(url, { method, headers, body, duplex: "half" } as RequestInit);
}

async function writeResponse(req: IncomingMessage, res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  if (response.statusText) res.statusMessage = response.statusText;
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("Set-Cookie", cookies);
  if (!response.body || req.method === "HEAD") {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  // The client went away: stop producing (cancels a streaming SSR render).
  const onClose = () => void reader.cancel().catch(() => {});
  res.once("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Respect backpressure; streamed SSR chunks go out as they're produced.
      if (!res.write(value)) await events.once(res, "drain");
    }
    res.end();
  } catch {
    res.destroy();
  } finally {
    res.off("close", onClose);
  }
}
