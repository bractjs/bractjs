import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageFormat, ImageTransformParams, TransformResult } from "./types.ts";

const MAX_MEM = 200;
// SECURITY(medium): bound the cache by BYTES as well as entries. One source
// image yields ~120 variants (quality × format × fit per width), each up to
// MAX_OUTPUT_BYTES, so an entry cap alone let an unauthenticated client fill
// gigabytes of RAM through /_image.
const MAX_MEM_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const mem = new Map<string, { result: TransformResult; hits: number }>();
let memBytes = 0;

async function cacheKey(src: string, params: ImageTransformParams): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify({ src, ...params }));
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function getFromMemory(
  src: string,
  params: ImageTransformParams,
): Promise<TransformResult | null> {
  const key = await cacheKey(src, params);
  const entry = mem.get(key);
  if (!entry) return null;
  entry.hits++;
  return entry.result;
}

export async function setInMemory(
  src: string,
  params: ImageTransformParams,
  result: TransformResult,
): Promise<void> {
  const key = await cacheKey(src, params);
  const size = result.data.byteLength;
  // Oversized variants are served from the disk cache instead.
  if (size > MAX_ENTRY_BYTES) return;
  const existing = mem.get(key);
  if (existing) {
    memBytes -= existing.result.data.byteLength;
    mem.delete(key);
  }
  while (mem.size > 0 && (mem.size >= MAX_MEM || memBytes + size > MAX_MEM_BYTES)) {
    let minKey = "";
    let minHits = Infinity;
    for (const [k, v] of mem) {
      if (v.hits < minHits) {
        minHits = v.hits;
        minKey = k;
      }
    }
    memBytes -= mem.get(minKey)!.result.data.byteLength;
    mem.delete(minKey);
  }
  mem.set(key, { result, hits: 0 });
  memBytes += size;
}

/** Test hook: drop every in-memory variant. */
export function clearMemoryCache(): void {
  mem.clear();
  memBytes = 0;
}

export async function getFromDisk(
  dir: string,
  src: string,
  params: ImageTransformParams,
): Promise<TransformResult | null> {
  const key = await cacheKey(src, params);
  const metaFile = join(dir, `${key}.json`);
  const dataFile = join(dir, `${key}.bin`);
  // No existence pre-check: it would create a TOCTOU race where the file is
  // deleted between exists() and read(). Just attempt the reads and let either
  // a missing file or invalid JSON fall through to MISS.
  try {
    const [metaText, bytes] = await Promise.all([readFile(metaFile, "utf8"), readFile(dataFile)]);
    const meta = JSON.parse(metaText) as { contentType: string; format: ImageFormat };
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { data, contentType: meta.contentType, format: meta.format };
  } catch {
    return null;
  }
}

export async function setOnDisk(
  dir: string,
  src: string,
  params: ImageTransformParams,
  result: TransformResult,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const key = await cacheKey(src, params);
  const jsonFinal = join(dir, `${key}.json`);
  const binFinal = join(dir, `${key}.bin`);
  // Unique per writer: two concurrent misses for the same variant must not
  // share a temp file (one would rename the other's half-written bytes into
  // place, and its cleanup would unlink the file the other is still writing).
  const tmpId = crypto.randomUUID();
  const jsonTmp = `${jsonFinal}.${tmpId}.tmp`;
  const binTmp = `${binFinal}.${tmpId}.tmp`;
  // Write both temp files, then atomically rename. Readers see either both
  // files present or neither — never a half-written pair.
  try {
    await Promise.all([
      writeFile(jsonTmp, JSON.stringify({ contentType: result.contentType, format: result.format })),
      writeFile(binTmp, new Uint8Array(result.data)),
    ]);
    await Promise.all([rename(jsonTmp, jsonFinal), rename(binTmp, binFinal)]);
  } catch (err) {
    // Best-effort cleanup so failed writes don't leak .tmp files indefinitely.
    await Promise.all([unlink(jsonTmp).catch(() => {}), unlink(binTmp).catch(() => {})]);
    throw err;
  }
}
