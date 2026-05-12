import type { ImageTransformParams, TransformResult, ImageFormat } from "./types.ts";
import { MIME } from "./types.ts";

// Probe for an available ImageMagick binary once, then cache the result.
let _binary: string | null | undefined;

async function detectBinary(): Promise<string | null> {
  for (const bin of ["magick", "convert"]) {
    try {
      const proc = Bun.spawn([bin, "-version"], { stdout: "ignore", stderr: "ignore" });
      if ((await proc.exited) === 0) return bin;
    } catch { /* not found */ }
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

function buildArgs(binary: string, input: string, params: ImageTransformParams): string[] {
  const base = binary === "magick" ? ["magick", "convert"] : ["convert"];
  return [
    ...base,
    input,
    ...resizeArgs(params),
    "-quality", String(params.q),
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

  const proc = Bun.spawn(buildArgs(binary, filePath, params), {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [data, , exitCode] = await Promise.all([
    new Response(proc.stdout!).arrayBuffer(),
    new Response(proc.stderr!).arrayBuffer(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`[bractjs] ImageMagick exited ${exitCode} for ${filePath}`);
  }

  return { data, contentType: MIME[params.format], format: params.format };
}
