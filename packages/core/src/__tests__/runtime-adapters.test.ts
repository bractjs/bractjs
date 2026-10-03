// Node.js and Deno adapters, Cloudflare's platform context, and the runtime
// file shim. (The full app on Node is covered by `E2E_TARGET=node pnpm e2e`.)
import { afterEach, describe, expect, test } from "bun:test";
import { createCloudflareAdapter, makeCloudflareHandler } from "../adapters/cloudflare.ts";
import { DenoAdapter } from "../adapters/deno.ts";
import { NodeAdapter } from "../adapters/node.ts";
import { getClientAddress } from "../server/client-address.ts";
import { getPlatform } from "../server/platform.ts";
import { runWithRequest } from "../server/request-context.ts";
import { contentTypeFor } from "../server/runtime.ts";

const port = () => 5600 + Math.floor(Math.random() * 300);

describe("NodeAdapter (node:http)", () => {
  let adapter: NodeAdapter | null = null;
  afterEach(() => {
    adapter?.stop();
    adapter = null;
  });

  test("translates requests and responses: method, headers, body, status, multiple Set-Cookie", async () => {
    adapter = new NodeAdapter();
    adapter.setHandler(async (req) => {
      const body = req.method === "POST" ? await req.text() : "";
      const headers = new Headers({ "X-Echo": req.headers.get("X-Test") ?? "" });
      headers.append("Set-Cookie", "a=1; Path=/");
      headers.append("Set-Cookie", "b=2; Path=/");
      return new Response(`${req.method} ${new URL(req.url).pathname} ${body} ${getClientAddress(req)}`, {
        status: 201,
        headers,
      });
    });
    const p = port();
    adapter.listen(p);
    await Bun.sleep(50);
    const res = await fetch(`http://127.0.0.1:${p}/x?y=1`, {
      method: "POST",
      headers: { "X-Test": "hi" },
      body: "payload",
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Echo")).toBe("hi");
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(await res.text()).toMatch(/^POST \/x payload (127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
  });

  test("streams the body as it's produced", async () => {
    adapter = new NodeAdapter();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    adapter.setHandler(async () => {
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode("first;"));
          await gate;
          controller.enqueue(new TextEncoder().encode("second"));
          controller.close();
        },
      });
      return new Response(body);
    });
    const p = port();
    adapter.listen(p);
    await Bun.sleep(50);
    const res = await fetch(`http://127.0.0.1:${p}/`);
    const reader = res.body!.getReader();
    // The first chunk arrives before the stream is finished.
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first;");
    release();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    expect(rest).toBe("second");
  });

  test("rejects an oversized body with 413, and turns handler crashes into a generic 500", async () => {
    adapter = new NodeAdapter({ maxRequestBodySize: 10 });
    adapter.setHandler(async (req) => {
      if (new URL(req.url).pathname === "/crash") throw new Error("secret detail");
      return new Response(await req.text());
    });
    const p = port();
    adapter.listen(p);
    await Bun.sleep(50);
    const big = await fetch(`http://127.0.0.1:${p}/`, { method: "POST", body: "x".repeat(100) });
    expect(big.status).toBe(413);
    const err = console.error;
    console.error = () => {};
    try {
      const crash = await fetch(`http://127.0.0.1:${p}/crash`);
      expect(crash.status).toBe(500);
      expect(await crash.text()).not.toContain("secret detail");
    } finally {
      console.error = err;
    }
  });
});

describe("DenoAdapter (Deno.serve)", () => {
  afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
  });

  test("serves through Deno.serve and records the client address", async () => {
    let served:
      ((req: Request, info: { remoteAddr: { hostname: string } }) => Response | Promise<Response>) | null =
      null;
    let options: { port: number; hostname?: string } | null = null;
    let shutDown = false;
    (globalThis as { Deno?: unknown }).Deno = {
      serve(opts: { port: number; hostname?: string }, handler: typeof served) {
        options = opts;
        served = handler;
        return {
          shutdown: async () => {
            shutDown = true;
          },
        };
      },
    };
    const adapter = new DenoAdapter({ hostname: "0.0.0.0" });
    adapter.setHandler(async (req) => new Response(getClientAddress(req) ?? "none"));
    adapter.listen(8123);
    expect(options).toMatchObject({ port: 8123, hostname: "0.0.0.0" });
    const res = await served!(new Request("http://x/"), { remoteAddr: { hostname: "203.0.113.5" } });
    expect(await res.text()).toBe("203.0.113.5");
    adapter.stop();
    expect(shutDown).toBe(true);
  });

  test("caps request bodies: 413 on a declared oversize, read error on a streamed one", async () => {
    let served: ((req: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>) | null =
      null;
    (globalThis as { Deno?: unknown }).Deno = {
      serve(_opts: unknown, handler: typeof served) {
        served = handler;
        return { shutdown: async () => {} };
      },
    };
    const adapter = new DenoAdapter({ maxRequestBodySize: 10 });
    adapter.setHandler(async (req) => {
      try {
        return new Response(`${await req.text()} ${getClientAddress(req)}`);
      } catch {
        return new Response("body rejected", { status: 400 });
      }
    });
    adapter.listen(8124);
    const info = { remoteAddr: { hostname: "203.0.113.5" } };
    const declared = await served!(
      new Request("http://x/", {
        method: "POST",
        body: "x".repeat(100),
        headers: { "Content-Length": "100" },
      }),
      info,
    );
    expect(declared.status).toBe(413);
    // No Content-Length: the bytes are counted as they stream.
    const streamed = await served!(new Request("http://x/", { method: "POST", body: "x".repeat(100) }), info);
    expect(streamed.status).toBe(400);
    const small = await served!(new Request("http://x/", { method: "POST", body: "ok" }), info);
    expect(await small.text()).toBe("ok 203.0.113.5");
  });

  test("refuses to listen outside Deno", () => {
    const adapter = new DenoAdapter();
    adapter.setHandler(async () => new Response());
    expect(() => adapter.listen(1)).toThrow("not running on Deno");
  });
});

describe("Cloudflare platform context", () => {
  test("env and ctx reach app code through getPlatform()", async () => {
    const handler = async (request: Request) =>
      runWithRequest(request, () => {
        const platform = getPlatform<{ env: { GREETING: string } }>();
        return new Response(platform?.env.GREETING ?? "none");
      });
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const worker = makeCloudflareHandler(handler);
    expect(await (await worker.fetch(new Request("https://x/"), { GREETING: "hello" }, ctx)).text()).toBe(
      "hello",
    );
    const adapter = createCloudflareAdapter(handler);
    expect(await (await adapter.fetch(new Request("https://x/"), { GREETING: "hey" }, ctx)).text()).toBe(
      "hey",
    );
    expect(await (await adapter.fetch(new Request("https://x/"))).text()).toBe("none");
  });
});

describe("runtime shim", () => {
  test("content types by extension, as Bun.file would infer", () => {
    expect(contentTypeFor("/a/app.4f2.js")).toContain("javascript");
    expect(contentTypeFor("x.CSS")).toContain("text/css");
    expect(contentTypeFor("icon.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("blob.bin")).toBe("application/octet-stream");
  });
});
