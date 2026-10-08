import { describe, expect, test } from "bun:test";
import { handleStreamRequest } from "../server/stream-handler.ts";

const VALID_ID = "0123456789abcdef"; // 16 lowercase hex chars (passes the id regex)

function streamReq(headers: Record<string, string>, id = VALID_ID): Request {
  return new Request(`http://localhost/_stream?id=${id}`, { method: "GET", headers });
}

describe("handleStreamRequest — CSRF gate", () => {
  test("non-/_stream path returns null (falls through)", async () => {
    const res = await handleStreamRequest(new Request("http://localhost/other"));
    expect(res).toBeNull();
  });

  test("missing X-BractJS-Action → 403 even with a same-origin Origin", async () => {
    const res = await handleStreamRequest(streamReq({ Origin: "http://localhost" }));
    expect(res?.status).toBe(403);
  });

  test("missing X-BractJS-Action → 403 with no headers", async () => {
    const res = await handleStreamRequest(streamReq({}));
    expect(res?.status).toBe(403);
  });

  test("with X-BractJS-Action but unknown id → 404 (passes the gate)", async () => {
    const res = await handleStreamRequest(streamReq({ "X-BractJS-Action": "1" }));
    // Gate passed; unknown action id resolves to 404 (not 403).
    expect(res?.status).toBe(404);
  });

  test("with X-BractJS-Action but malformed id → 400 (passes the gate)", async () => {
    const res = await handleStreamRequest(streamReq({ "X-BractJS-Action": "1" }, "NOT-HEX"));
    expect(res?.status).toBe(400);
  });
});

// ── Pull-driven streaming ───────────────────────────────────────────────────
// The Response is read directly (not over Bun.serve, whose socket buffering
// would pull ahead of the test's reader).

describe("streamAction — backpressure, cancel, request context", async () => {
  const { clearActionRegistry, loadServerActionsFromRegistry } = await import("../server/action-registry.ts");
  const { getRequest, runWithRequest } = await import("../server/request-context.ts");

  async function idFor(name: string): Promise<string> {
    const raw = new TextEncoder().encode(`lib/stream.server.ts#${name}`);
    const buf = await crypto.subtle.digest("SHA-256", raw);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }

  const state = { advanced: 0, finalized: false };
  async function* big() {
    try {
      for (let i = 0; i < 1000; i++) {
        state.advanced++;
        yield i;
      }
    } finally {
      state.finalized = true;
    }
  }
  async function* whoAmI() {
    await Promise.resolve();
    yield "first";
    // Resumed from pull(), i.e. from whoever reads the body.
    yield getRequest().url;
  }
  async function plain() {
    return { ok: true };
  }

  clearActionRegistry();
  await loadServerActionsFromRegistry([{ relPath: "lib/stream.server.ts", mod: { big, whoAmI, plain } }]);

  async function open(name: string): Promise<{ req: Request; res: Response }> {
    const req = new Request(`http://localhost/_stream?id=${await idFor(name)}`, {
      headers: { "X-BractJS-Action": "1" },
    });
    const res = await runWithRequest(req, () => handleStreamRequest(req));
    return { req, res: res! };
  }

  async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    const { value } = await reader.read();
    return new TextDecoder().decode(value);
  }

  test("the generator advances only as the client reads (no unbounded server buffer)", async () => {
    state.advanced = 0;
    const { res } = await open("big");
    const reader = res.body!.getReader();
    expect(await readChunk(reader)).toContain("data: 0");
    await Bun.sleep(30);
    // One value read; the default high-water mark allows one more in flight.
    expect(state.advanced).toBeLessThanOrEqual(3);
    await reader.cancel();
  });

  test("cancelling the body (client disconnect) runs the generator's finally, with no error logged", async () => {
    state.finalized = false;
    const errors: unknown[] = [];
    const prev = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const { res } = await open("big");
      const reader = res.body!.getReader();
      await readChunk(reader);
      await reader.cancel();
      await Bun.sleep(10);
    } finally {
      console.error = prev;
    }
    expect(state.finalized).toBe(true);
    expect(errors).toEqual([]);
  });

  test("values yielded after the first still see the request's context (getRequest())", async () => {
    const { req, res } = await open("whoAmI");
    const text = await res.text();
    expect(text).toContain('data: "first"');
    expect(text).toContain(`data: ${JSON.stringify(req.url)}`);
    expect(text).toContain("event: done");
  });

  test("a plain return value is one data event, then done", async () => {
    const { res } = await open("plain");
    const text = await res.text();
    expect(text).toBe('event: data\ndata: {"ok":true}\n\nevent: done\ndata: {}\n\n');
  });
});
