import { describe, expect, test } from "bun:test";
import { createCloudflareAdapter, makeCloudflareHandler } from "../adapters/cloudflare.ts";

const echoHandler = (request: Request) =>
  Promise.resolve(new Response(`handled ${new URL(request.url).pathname}`, { status: 200 }));

describe("createCloudflareAdapter", () => {
  test("implements BractAdapter.fetch by delegating to the handler", async () => {
    const adapter = createCloudflareAdapter(echoHandler);
    const res = await adapter.fetch(new Request("https://x.test/hello"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("handled /hello");
  });

  test("handler errors propagate (Workers surface them as 1101/exception)", async () => {
    const adapter = createCloudflareAdapter(() => Promise.reject(new Error("boom")));
    await expect(adapter.fetch(new Request("https://x.test/"))).rejects.toThrow("boom");
  });
});

describe("makeCloudflareHandler", () => {
  test("exposes the Workers { fetch(request, env, ctx) } shape", async () => {
    const worker = makeCloudflareHandler(echoHandler);
    const env = { KV: "binding" };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const res = await worker.fetch(new Request("https://x.test/worker"), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("handled /worker");
  });
});
