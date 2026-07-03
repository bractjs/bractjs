import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ImageFormat, ImageTransformParams, TransformResult } from "./types.ts";

const MAX_MEM = 200;
const mem = new Map<string, { result: TransformResult; hits: number }>();

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
  if (mem.size >= MAX_MEM) {
    let minKey = "";
    let minHits = Infinity;
    for (const [k, v] of mem) {
      if (v.hits < minHits) {
        minHits = v.hits;
        minKey = k;
      }
    }
    if (minKey) mem.delete(minKey);
  }
  mem.set(key, { result, hits: 0 });
}

export async function getFromDisk(
  dir: string,
  src: string,
  params: ImageTransformParams,
): Promise<TransformResult | null> {
  const key = await cacheKey(src, params);
  const metaFile = Bun.file(join(dir, `${key}.json`));
  const dataFile = Bun.file(join(dir, `${key}.bin`));
  // No existence pre-check: it would create a TOCTOU race where the file is
  // deleted between exists() and read(). Just attempt the reads and let either
  // a missing file or invalid JSON fall through to MISS.
  try {
    const [meta, data] = await Promise.all([
      metaFile.json() as Promise<{ contentType: string; format: ImageFormat }>,
      dataFile.arrayBuffer(),
    ]);
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
  const jsonTmp = `${jsonFinal}.tmp`;
  const binTmp = `${binFinal}.tmp`;
  // Write both temp files, then atomically rename. Readers see either both
  // files present or neither — never a half-written pair.
  try {
    await Promise.all([
      Bun.write(jsonTmp, JSON.stringify({ contentType: result.contentType, format: result.format })),
      Bun.write(binTmp, result.data),
    ]);
    await Promise.all([rename(jsonTmp, jsonFinal), rename(binTmp, binFinal)]);
  } catch (err) {
    // Best-effort cleanup so failed writes don't leak .tmp files indefinitely.
    await Promise.all([unlink(jsonTmp).catch(() => {}), unlink(binTmp).catch(() => {})]);
    throw err;
  }
}
