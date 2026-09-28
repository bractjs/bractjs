// Namespace import, not named: route modules reach this file through the
// package barrel, and the client build resolves the whole graph before
// dropping it. Bun's browser polyfill for node:zlib lacks brotli/gzipSync, so
// named imports fail every client build.
import * as zlib from "node:zlib";

// Response compression for every createServer() run mode (dev, start, compiled
// binary). Applied outside the global middleware pipeline, so middleware sees
// and edits uncompressed responses.
//
// Two strategies:
// - Hashed client assets (/build/client/*, served `immutable`) are compressed
//   once at maximum quality — brotli preferred — and cached in memory: they
//   never change for the life of the process, so repeat requests cost nothing.
// - Everything else (streamed SSR HTML, /_data and /api JSON, /public files) is
//   compressed as a stream, flushing after every chunk so defer()/Suspense
//   boundaries still reach the browser the moment React writes them. gzip is
//   preferred here: at a fast setting brotli's ratio is about the same, but a
//   live brotli encoder per in-flight response more than doubled server memory
//   under load (131 MB identity → 163 MB gzip vs 307 MB brotli, 50 concurrent).

export type Encoding = "br" | "gzip";

const COMPRESSIBLE_TYPE =
  /^(text\/(?!event-stream)|application\/(json|javascript|xml|manifest\+json|ld\+json)|image\/svg\+xml)/i;

/** Below this, compression overhead outweighs the savings. */
const MIN_BYTES = 1024;

/** Upper bound on cached compressed assets, per process. */
const ASSET_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const assetCache = new Map<string, Uint8Array<ArrayBuffer>>();
let assetCacheBytes = 0;

/** Pick the first encoding in `preference` that the client accepts (q > 0). */
export function negotiateEncoding(
  acceptEncoding: string | null,
  preference: readonly Encoding[] = ["br", "gzip"],
): Encoding | null {
  if (!acceptEncoding) return null;
  const q = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    q.set(name, qParam ? Number(qParam.slice(2)) || 0 : 1);
  }
  const accepts = (enc: Encoding) => (q.get(enc) ?? q.get("*") ?? 0) > 0;
  return preference.find(accepts) ?? null;
}

function isCompressible(request: Request, response: Response): boolean {
  if (request.method === "HEAD" || !response.body) return false;
  if (
    response.status < 200 ||
    response.status === 204 ||
    response.status === 206 ||
    response.status === 304
  ) {
    return false;
  }
  if (response.headers.has("Content-Encoding")) return false;
  if (/\bno-transform\b/i.test(response.headers.get("Cache-Control") ?? "")) return false;
  return COMPRESSIBLE_TYPE.test(response.headers.get("Content-Type") ?? "");
}

function encodedHeaders(response: Response, encoding: Encoding): Headers {
  const headers = new Headers(response.headers);
  headers.set("Content-Encoding", encoding);
  headers.delete("Content-Length");
  // The encoded bytes differ from the identity representation, so a strong
  // validator would be wrong; a weak one still revalidates correctly.
  const etag = headers.get("ETag");
  if (etag && !etag.startsWith("W/")) headers.set("ETag", `W/${etag}`);
  return headers;
}

function addVary(headers: Headers): void {
  const vary = headers.get("Vary");
  if (!vary) headers.set("Vary", "Accept-Encoding");
  else if (!/\baccept-encoding\b/i.test(vary) && vary.trim() !== "*")
    headers.set("Vary", `${vary}, Accept-Encoding`);
}

function compressSync(bytes: Uint8Array, encoding: Encoding): Uint8Array<ArrayBuffer> {
  // Copied into a fresh ArrayBuffer: a zlib Buffer isn't a valid BodyInit under the DOM lib types.
  const encoded =
    encoding === "br"
      ? zlib.brotliCompressSync(bytes, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
          },
        })
      : zlib.gzipSync(bytes, { level: zlib.constants.Z_BEST_COMPRESSION });
  return new Uint8Array(encoded);
}

/** Stream `body` through zlib, flushing after every chunk (keeps SSR streaming). */
function compressStream(body: ReadableStream<Uint8Array>, encoding: Encoding): ReadableStream<Uint8Array> {
  const encoder =
    encoding === "br"
      ? zlib.createBrotliCompress({
          flush: zlib.constants.BROTLI_OPERATION_FLUSH,
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
            // Only reached when a client accepts br but not gzip. A 256 KB window
            // instead of the 4 MB default cuts per-encoder memory (364 → 307 MB
            // RSS at 50 concurrent); pages rarely exceed it, so the ratio holds.
            [zlib.constants.BROTLI_PARAM_LGWIN]: 18,
          },
        })
      : zlib.createGzip({ level: 6, flush: zlib.constants.Z_SYNC_FLUSH });
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      encoder.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      encoder.on("end", () => controller.close());
      encoder.on("error", (err) => controller.error(err));
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            encoder.write(value);
          }
          encoder.end();
        } catch (err) {
          encoder.destroy(err as Error);
        }
      })();
    },
    cancel(reason) {
      void reader.cancel(reason);
      encoder.destroy();
    },
  });
}

/** Compress `response` for `request` when both sides allow it; otherwise return it unchanged. */
export async function compressResponse(request: Request, response: Response): Promise<Response> {
  if (!isCompressible(request, response)) return response;
  const { pathname } = new URL(request.url);
  const immutableAsset =
    pathname.startsWith("/build/client/") &&
    /\bimmutable\b/i.test(response.headers.get("Cache-Control") ?? "");
  const encoding = negotiateEncoding(
    request.headers.get("Accept-Encoding"),
    immutableAsset ? ["br", "gzip"] : ["gzip", "br"],
  );
  if (!encoding) {
    // Still vary: a shared cache must not hand this identity copy to a client
    // that asked for br/gzip.
    const headers = new Headers(response.headers);
    addVary(headers);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  if (immutableAsset) {
    const key = `${encoding}:${pathname}`;
    let encoded = assetCache.get(key);
    if (!encoded) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < MIN_BYTES) {
        const headers = new Headers(response.headers);
        addVary(headers);
        return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
      }
      encoded = compressSync(bytes, encoding);
      if (assetCacheBytes + encoded.byteLength <= ASSET_CACHE_MAX_BYTES) {
        assetCache.set(key, encoded);
        assetCacheBytes += encoded.byteLength;
      }
    }
    const headers = encodedHeaders(response, encoding);
    addVary(headers);
    return new Response(encoded, { status: response.status, statusText: response.statusText, headers });
  }

  const headers = encodedHeaders(response, encoding);
  addVary(headers);
  return new Response(compressStream(response.body as ReadableStream<Uint8Array>, encoding), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Wrap a fetch handler so every response it produces is compressed when the client accepts it. */
export function withCompression(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => compressResponse(request, await handler(request));
}

/** Test hook: drop cached compressed assets. */
export function clearCompressionCache(): void {
  assetCache.clear();
  assetCacheBytes = 0;
}
