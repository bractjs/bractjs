import { join, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";
import type { ImageTransformParams, ImageFormat, ImageFit } from "./types.ts";
import { QUALITY_DEFAULT, FORMAT_DEFAULT, FIT_DEFAULT, MIME, ALLOWED_FITS } from "./types.ts";
import { transformImage } from "./optimizer.ts";
import { getFromMemory, setInMemory, getFromDisk, setOnDisk } from "./cache.ts";

const ALLOWED_DIMS = new Set([320, 640, 768, 1024, 1280, 1536, 1920, 3840]);
const MAX_AREA = 4_000_000;
const CACHE_CTRL = "public, max-age=31536000, immutable";

async function parseParams(
  sp: URLSearchParams,
  publicDir: string,
): Promise<{ src: string; filePath: string; params: ImageTransformParams } | null> {
  const src = sp.get("src");
  // src must be a /public/ path with no ".." path segment. We check segments
  // (not substring) so filenames like "foo..bar.jpg" are still allowed —
  // realpath()/prefix check below is the authoritative escape guard.
  if (!src || !src.startsWith("/public/")) return null;
  if (src.split("/").includes("..")) return null;

  const rel = src.slice("/public/".length);
  const root = resolve(publicDir);
  const candidate = resolve(join(root, rel));
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  // Re-check after symlink resolution. If the file doesn't exist yet, realpath
  // throws — fall through and let the existence check below handle it.
  let filePath = candidate;
  try {
    const real = await realpath(candidate);
    if (!real.startsWith(root + sep) && real !== root) return null;
    filePath = real;
  } catch {
    // missing file: defer to Bun.file(...).exists() below
  }

  const wRaw = sp.get("w");
  const hRaw = sp.get("h");
  const w = wRaw ? parseInt(wRaw, 10) : undefined;
  const h = hRaw ? parseInt(hRaw, 10) : undefined;
  if (w !== undefined && (isNaN(w) || !ALLOWED_DIMS.has(w))) return null;
  if (h !== undefined && (isNaN(h) || !ALLOWED_DIMS.has(h))) return null;
  if (w !== undefined && h !== undefined && w * h > MAX_AREA) return null;

  const q = Math.min(100, Math.max(1, parseInt(sp.get("q") ?? String(QUALITY_DEFAULT), 10)));
  const fmt = (sp.get("format") ?? FORMAT_DEFAULT) as ImageFormat;
  const fitRaw = sp.get("fit") ?? FIT_DEFAULT;
  if (!MIME[fmt]) return null;
  if (!ALLOWED_FITS.has(fitRaw as ImageFit)) return null;
  const fit = fitRaw as ImageFit;

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

  const parsed = await parseParams(url.searchParams, publicDir);
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
