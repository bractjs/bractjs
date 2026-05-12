import { join, resolve } from "node:path";
import type { ImageTransformParams, ImageFormat, ImageFit } from "./types.ts";
import { QUALITY_DEFAULT, FORMAT_DEFAULT, FIT_DEFAULT, MIME } from "./types.ts";
import { transformImage } from "./optimizer.ts";
import { getFromMemory, setInMemory, getFromDisk, setOnDisk } from "./cache.ts";

const MAX_DIM = 4096;
const CACHE_CTRL = "public, max-age=31536000, immutable";

function parseParams(
  sp: URLSearchParams,
  publicDir: string,
): { src: string; filePath: string; params: ImageTransformParams } | null {
  const src = sp.get("src");
  // src must be a /public/ path with no traversal sequences
  if (!src || !src.startsWith("/public/") || src.includes("..")) return null;

  const rel = src.slice("/public/".length);
  const root = resolve(publicDir);
  const filePath = resolve(join(root, rel));
  if (!filePath.startsWith(root + "/") && filePath !== root) return null;

  const wRaw = sp.get("w");
  const hRaw = sp.get("h");
  const w = wRaw ? parseInt(wRaw, 10) : undefined;
  const h = hRaw ? parseInt(hRaw, 10) : undefined;
  if (w !== undefined && (isNaN(w) || w < 1 || w > MAX_DIM)) return null;
  if (h !== undefined && (isNaN(h) || h < 1 || h > MAX_DIM)) return null;

  const q = Math.min(100, Math.max(1, parseInt(sp.get("q") ?? String(QUALITY_DEFAULT), 10)));
  const fmt = (sp.get("format") ?? FORMAT_DEFAULT) as ImageFormat;
  const fit = (sp.get("fit") ?? FIT_DEFAULT) as ImageFit;
  if (!MIME[fmt]) return null;

  return { src, filePath, params: { w, h, q, format: fmt, fit } };
}

function imageResponse(result: { data: ArrayBuffer; contentType: string }, cacheStatus: string): Response {
  return new Response(result.data, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": CACHE_CTRL,
      "X-Image-Cache": cacheStatus,
    },
  });
}

export async function handleImageRequest(
  request: Request,
  publicDir: string,
  cacheDir: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/_image") return null;

  const parsed = parseParams(url.searchParams, publicDir);
  if (!parsed) return new Response("Bad Request", { status: 400 });

  const { src, filePath, params } = parsed;
  if (!(await Bun.file(filePath).exists())) {
    return new Response("Not Found", { status: 404 });
  }

  const memHit = await getFromMemory(src, params);
  if (memHit) return imageResponse(memHit, "MEM");

  const diskHit = await getFromDisk(cacheDir, src, params);
  if (diskHit) {
    setInMemory(src, params, diskHit).catch(() => {});
    return imageResponse(diskHit, "DISK");
  }

  try {
    const result = await transformImage(filePath, params);
    setInMemory(src, params, result).catch(() => {});
    setOnDisk(cacheDir, src, params, result).catch(() => {});
    return imageResponse(result, "MISS");
  } catch (err) {
    console.error("[bractjs] image optimization error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
