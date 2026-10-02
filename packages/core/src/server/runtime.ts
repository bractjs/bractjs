// The few file operations the request path needs, on Bun, Node.js or Deno.
// Everything that serves a request goes through here instead of `Bun.file`,
// so a production server built with `bractjs build --target node` runs on
// Node (or Deno) unchanged. Build- and dev-time code (Bun.build, Bun.plugin,
// route scanning) stays Bun-only.
// Namespace imports for the same reason as adapters/node.ts (client build +
// node:* browser polyfills).
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { extname } from "node:path";
import * as stream from "node:stream";

type BunLike = {
  file(path: string): Blob & { exists(): Promise<boolean>; text(): Promise<string>; type: string };
};
const bun = (globalThis as { Bun?: BunLike }).Bun;

/** Whether `path` is an existing file. */
export async function fileExists(path: string): Promise<boolean> {
  if (bun) return bun.file(path).exists();
  try {
    return (await fsp.stat(path)).isFile();
  } catch {
    return false;
  }
}

/** A file's contents as text (throws when missing). */
export function readText(path: string): Promise<string> {
  if (bun) return bun.file(path).text();
  return fsp.readFile(path, "utf8");
}

/** A file as a response body with its content type, or null when it isn't a file. */
export async function fileBody(
  path: string,
): Promise<{ body: BodyInit; type: string; size?: number } | null> {
  if (bun) {
    const file = bun.file(path);
    return (await file.exists())
      ? { body: file, type: file.type || contentTypeFor(path), size: file.size }
      : null;
  }
  try {
    const info = await fsp.stat(path);
    if (!info.isFile()) return null;
    const body = stream.Readable.toWeb(fs.createReadStream(path)) as unknown as ReadableStream<Uint8Array>;
    return { body, type: contentTypeFor(path), size: info.size };
  } catch {
    return null;
  }
}

const MIME: Record<string, string> = {
  ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".html": "text/html;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".map": "application/json;charset=utf-8",
  ".txt": "text/plain;charset=utf-8",
  ".xml": "application/xml;charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

/** Content type by file extension (what Bun.file infers), for runtimes without it. */
export function contentTypeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}
