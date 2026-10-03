import { beforeEach, describe, expect, test } from "bun:test";
import { brotliDecompressSync, constants, gunzipSync } from "node:zlib";
import { clearCompressionCache, compressResponse, negotiateEncoding } from "../server/compression.ts";

const HTML = `<!doctype html><html><body>${"<p>streamed row</p>".repeat(200)}</body></html>`;

function req(path = "/", accept: string | null = "gzip, deflate, br", method = "GET"): Request {
  const headers: Record<string, string> = {};
  if (accept !== null) headers["Accept-Encoding"] = accept;
  return new Request(`http://localhost${path}`, { method, headers });
}

function html(body: BodyInit | null = HTML, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
}

const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());

beforeEach(() => clearCompressionCache());

describe("negotiateEncoding", () => {
  test("prefers brotli by default, falls back to gzip", () => {
    expect(negotiateEncoding("gzip, deflate, br")).toBe("br");
    expect(negotiateEncoding("gzip")).toBe("gzip");
    expect(negotiateEncoding("deflate")).toBeNull();
    expect(negotiateEncoding(null)).toBeNull();
  });

  test("honors q-values and wildcards", () => {
    expect(negotiateEncoding("br;q=0, gzip")).toBe("gzip");
    expect(negotiateEncoding("br;q=0, gzip;q=0")).toBeNull();
    expect(negotiateEncoding("*")).toBe("br");
    expect(negotiateEncoding("*;q=0, gzip")).toBe("gzip");
    expect(negotiateEncoding("identity")).toBeNull();
  });

  test("follows a caller-supplied preference order", () => {
    expect(negotiateEncoding("gzip, deflate, br", ["gzip", "br"])).toBe("gzip");
    expect(negotiateEncoding("br", ["gzip", "br"])).toBe("br");
  });
});

describe("compressResponse", () => {
  // Streamed responses prefer gzip: a live brotli encoder per in-flight
  // response roughly doubled server memory under load.
  test("streamed HTML prefers gzip even when brotli is accepted", async () => {
    const res = await compressResponse(req(), html());
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
    const body = await bytes(res);
    expect(body.byteLength).toBeLessThan(HTML.length / 5);
    expect(gunzipSync(body).toString()).toBe(HTML);
  });

  test("brotli for streamed HTML when that's all the client accepts", async () => {
    const res = await compressResponse(req("/", "br"), html());
    expect(res.headers.get("Content-Encoding")).toBe("br");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
    const body = await bytes(res);
    expect(body.byteLength).toBeLessThan(HTML.length / 5);
    expect(brotliDecompressSync(body).toString()).toBe(HTML);
  });

  test("keeps status and headers; drops Content-Length; weakens ETag; extends Vary", async () => {
    const res = await compressResponse(
      req(),
      html(
        HTML,
        { "Content-Length": String(HTML.length), ETag: '"abc"', Vary: "Cookie", "X-Keep": "1" },
        404,
      ),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Length")).toBeNull();
    expect(res.headers.get("ETag")).toBe('W/"abc"');
    expect(res.headers.get("Vary")).toBe("Cookie, Accept-Encoding");
    expect(res.headers.get("X-Keep")).toBe("1");
  });

  test("streams: each chunk is decodable before the next one is produced", async () => {
    // A defer()/Suspense boundary must reach the browser as soon as React
    // writes it — compression must flush per chunk, not buffer to the end.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode("<p>shell</p>"));
        await gate; // the second chunk waits until the first was decoded
        controller.enqueue(new TextEncoder().encode("<p>deferred</p>"));
        controller.close();
      },
    });
    const res = await compressResponse(req("/", "gzip"), html(source));
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    expect(gunzipSync(first.value as Uint8Array, { finishFlush: constants.Z_SYNC_FLUSH }).toString()).toBe(
      "<p>shell</p>",
    );
    release();
    const rest: Uint8Array[] = [first.value as Uint8Array];
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest.push(r.value);
    expect(gunzipSync(Buffer.concat(rest)).toString()).toBe("<p>shell</p><p>deferred</p>");
  });

  test("backpressure: a slow client doesn't make the whole body buffer in memory", async () => {
    const CHUNKS = 200;
    let pulled = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled === CHUNKS) return controller.close();
        pulled++;
        // Incompressible, so the encoder's output is as large as its input.
        controller.enqueue(crypto.getRandomValues(new Uint8Array(65536)));
      },
    });
    const res = await compressResponse(req("/", "gzip"), html(source));
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await Bun.sleep(50);
    expect(pulled).toBeLessThan(CHUNKS);
    // Draining still delivers the whole body.
    const parts: Uint8Array[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
    expect(pulled).toBe(CHUNKS);
    expect(parts.length).toBeGreaterThan(0);
  });

  test("hashed client assets are compressed once and served from cache", async () => {
    const js = "export const x = 1;\n".repeat(500);
    const asset = () =>
      new Response(js, {
        headers: {
          "Content-Type": "text/javascript;charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    const first = await bytes(await compressResponse(req("/build/client/a.js"), asset()));
    // A body that differs proves the second response came from the cache.
    const cached = await compressResponse(
      req("/build/client/a.js"),
      new Response("different", { headers: asset().headers }),
    );
    expect(cached.headers.get("Content-Encoding")).toBe("br");
    expect(await bytes(cached)).toEqual(first);
    expect(brotliDecompressSync(first).toString()).toBe(js);
  });

  test("tiny hashed assets are left uncompressed", async () => {
    const res = await compressResponse(
      req("/build/client/tiny.js"),
      new Response("export {};", {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      }),
    );
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(await res.text()).toBe("export {};");
  });

  test("JSON is compressed", async () => {
    const data = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ i })) });
    const res = await compressResponse(
      req(),
      new Response(data, { headers: { "Content-Type": "application/json" } }),
    );
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    expect(gunzipSync(await bytes(res)).toString()).toBe(data);
  });

  test("identity when the client sends no Accept-Encoding, but still Vary", async () => {
    const res = await compressResponse(req("/", null), html());
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
    expect(await res.text()).toBe(HTML);
  });

  test.each([
    ["HEAD request", req("/", "br", "HEAD"), () => html(null)],
    ["image", req(), () => new Response(new Uint8Array(4096), { headers: { "Content-Type": "image/png" } })],
    [
      "event stream",
      req(),
      () => new Response("data: x\n\n", { headers: { "Content-Type": "text/event-stream" } }),
    ],
    ["already encoded", req(), () => html(HTML, { "Content-Encoding": "gzip" })],
    ["no-transform", req(), () => html(HTML, { "Cache-Control": "no-transform" })],
    ["204", req(), () => new Response(null, { status: 204 })],
    ["304", req(), () => new Response(null, { status: 304 })],
  ])("leaves %s untouched", async (_label, request, make) => {
    const original = make();
    expect(await compressResponse(request, original)).toBe(original);
  });
});
