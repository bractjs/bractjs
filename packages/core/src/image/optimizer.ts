// Namespace import, as in server/runtime.ts: this file is reachable from the
// package barrel, and node:child_process has no browser polyfill. node:* APIs
// (not Bun.spawn/Bun.file) so /_image works on Node and Deno servers too.
import * as cp from "node:child_process";
import { readFile } from "node:fs/promises";
import type { ImageFormat, ImageTransformParams, TransformResult } from "./types.ts";
import { MIME } from "./types.ts";

// In-process semaphore (DoS guard): cap concurrent ImageMagick spawns so a
// burst of /_image requests can't fork-bomb the server.
const MAX_CONCURRENT = 4;
// Per-spawn timeout (ms). A pathological input must not hold a slot forever;
// without this, four hung spawns wedge the whole image pipeline.
const SPAWN_TIMEOUT_MS = 15_000;
// Cap on a transformed image held in memory (execFile's default is 1 MiB).
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
let inFlight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  // The releasing caller transfers its slot to us (see releaseSlot).
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    // Hand the slot straight over: the waiter already counts as in flight
    // (acquireSlot increments only on the uncontended path), so a caller
    // arriving before it resumes can't slip into the same slot.
    next();
    return;
  }
  inFlight--;
}

// Probe for an available ImageMagick binary once, then cache the result.
let _binary: string | null | undefined;

async function detectBinary(): Promise<string | null> {
  for (const bin of ["magick", "convert"]) {
    try {
      await run(bin, ["-version"]);
      return bin;
    } catch {
      /* not found */
    }
  }
  return null;
}

/** Run `file args…` and resolve with its stdout; rejects on spawn failure, non-zero exit, or timeout. */
function run(file: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      file,
      args,
      { encoding: "buffer", timeout: SPAWN_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: MAX_OUTPUT_BYTES },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

async function getBinary(): Promise<string | null> {
  if (_binary !== undefined) return _binary;
  _binary = await detectBinary();
  return _binary;
}

function resizeArgs(params: ImageTransformParams): string[] {
  if (!params.w && !params.h) return [];
  const dim = `${params.w ?? ""}x${params.h ?? ""}`;
  if (params.fit === "fill") return ["-resize", `${dim}!`];
  if (params.fit === "contain") return ["-resize", dim];
  // cover: scale to fill then crop to exact box
  const args = ["-resize", `${dim}^`];
  if (params.w && params.h) args.push("-gravity", "Center", "-extent", dim);
  return args;
}

// Input coder per raster extension (the handler rejects every other type).
const INPUT_CODER: Record<string, string> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif",
};

export function buildArgs(binary: string, input: string, params: ImageTransformParams): string[] {
  const base = binary === "magick" ? ["magick", "convert"] : ["convert"];
  // SECURITY(medium): name the input coder explicitly from the (allowlisted)
  // extension. A bare path — even `file:` — lets ImageMagick sniff the format
  // from the file's magic bytes, so an MVG/SVG/MSL payload saved as `x.png`
  // (e.g. an upload whose MIME type the client lied about) would reach coders
  // that read local files ("ImageTragick"). With `png:` a non-PNG simply fails
  // to decode. The explicit coder also stops a filename like "https:evil.txt"
  // from being read as a URL.
  const ext = input.split(".").pop()?.toLowerCase() ?? "";
  const coder = INPUT_CODER[ext];
  if (!coder) throw new Error(`[bractjs] refusing to transform non-raster file ${input}`);
  return [
    ...base,
    `${coder}:${input}`,
    ...resizeArgs(params),
    "-quality",
    String(params.q),
    "-strip",
    `${params.format}:-`,
  ];
}

export async function transformImage(
  filePath: string,
  params: ImageTransformParams,
): Promise<TransformResult> {
  const binary = await getBinary();

  // No ImageMagick available — serve the original file as-is.
  if (!binary) {
    const bytes = await readFile(filePath);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpeg";
    const fmt = (ext === "jpg" ? "jpeg" : ext) as ImageFormat;
    return { data, contentType: MIME[fmt] ?? "image/jpeg", format: fmt };
  }

  await acquireSlot();
  try {
    const [file, ...args] = buildArgs(binary, filePath, params);
    let out: Buffer;
    try {
      out = await run(file, args);
    } catch (err) {
      // Covers non-zero exits, timeout-induced SIGKILL, and oversized output.
      const { code, signal } = err as { code?: unknown; signal?: unknown };
      throw new Error(`[bractjs] ImageMagick exited ${String(signal ?? code)} for ${filePath}`, {
        cause: err,
      });
    }
    const data = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    return { data, contentType: MIME[params.format], format: params.format };
  } finally {
    releaseSlot();
  }
}
