// app/upload.server.ts — server-only: save an uploaded File to public/uploads
// and record it in the media table.

import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { insertMedia, type Media } from "./models/media.server.ts";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./public/uploads";
const MAX_BYTES = 8 * 1024 * 1024; // under the framework's 10 MiB request cap
// SVG is intentionally excluded: it can carry inline <script>, and uploads are
// served same-origin from /public/uploads, so an SVG opened directly would run
// JS in the app origin (stored XSS). Stick to raster types only.
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// Leading magic bytes per allowlisted MIME type. `file.type` is client-supplied,
// so the bytes must agree with it before we store anything: an SVG/MVG/HTML
// payload labelled image/png would otherwise land in public/ as `x.png`, where
// the /_image optimizer (ImageMagick) or a sniffing client might interpret it.
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/gif": (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a",
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
};

function startsWith(b: Uint8Array, sig: number[]): boolean {
  return sig.every((v, i) => b[i] === v);
}
function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}

/** Whether `bytes` really is the raster type `mime` claims (see MAGIC). */
export function matchesMagic(mime: string, bytes: Uint8Array): boolean {
  return MAGIC[mime]?.(bytes) ?? false;
}

export type UploadResult = { ok: true; media: Media } | { ok: false; reason: string };

export async function saveUpload(file: unknown, alt = ""): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, reason: "Choose a file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, reason: "File is too large (max 8 MB)." };
  // Derive the stored extension SOLELY from the (allowlisted) MIME type — never
  // from the user-controlled filename, which could carry .html/.svg and be
  // served as executable content. file.type is still client-supplied, but the
  // worst case is a mislabeled raster image stored with a raster extension.
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { ok: false, reason: "Unsupported file type. Use PNG, JPEG, WEBP or GIF." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesMagic(file.type, bytes)) {
    return { ok: false, reason: "That file isn't a valid PNG, JPEG, WEBP or GIF image." };
  }

  const filename = `${crypto.randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await Bun.write(join(UPLOAD_DIR, filename), bytes);

  const media = insertMedia({
    filename,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    alt,
    url: `/public/uploads/${filename}`,
  });
  return { ok: true, media };
}

/** Best-effort file removal after a media row is deleted. */
export async function removeUploadFile(filename: string): Promise<void> {
  try {
    await unlink(join(UPLOAD_DIR, filename));
  } catch {
    // Already gone — fine.
  }
}
