import type { ImageFormat, ImageTransformParams, TransformResult } from "./types.ts";
import { MIME } from "./types.ts";

// In-process semaphore (DoS guard): cap concurrent ImageMagick spawns so a
// burst of /_image requests can't fork-bomb the server.
const MAX_CONCURRENT = 4;
// Per-spawn timeout (ms). A pathological input must not hold a slot forever;
// without this, four hung spawns wedge the whole image pipeline.
const SPAWN_TIMEOUT_MS = 15_000;
let inFlight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight++;
}

function releaseSlot(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

// Probe for an available ImageMagick binary once, then cache the result.
let _binary: string | null | undefined;

async function detectBinary(): Promise<string | null> {
  for (const bin of ["magick", "convert"]) {
    try {
      const proc = Bun.spawn([bin, "-version"], { stdout: "ignore", stderr: "ignore" });
      if ((await proc.exited) === 0) return bin;
    } catch {
      /* not found */
    }
  }
  return null;
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
    const data = await Bun.file(filePath).arrayBuffer();
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpeg";
    const fmt = (ext === "jpg" ? "jpeg" : ext) as ImageFormat;
    return { data, contentType: MIME[fmt] ?? "image/jpeg", format: fmt };
  }

  await acquireSlot();
  try {
    const proc = Bun.spawn(buildArgs(binary, filePath, params), {
      stdout: "pipe",
      stderr: "ignore",
      timeout: SPAWN_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });

    const [data, exitCode] = await Promise.all([new Response(proc.stdout!).arrayBuffer(), proc.exited]);

    if (exitCode !== 0) {
      // Non-zero exit covers normal failures AND timeout-induced SIGKILL,
      // since Bun reports the signal as a non-zero exit code.
      throw new Error(`[bractjs] ImageMagick exited ${exitCode} for ${filePath}`);
    }

    return { data, contentType: MIME[params.format], format: params.format };
  } finally {
    releaseSlot();
  }
}
