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

  const filename = `${crypto.randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await Bun.write(join(UPLOAD_DIR, filename), await file.arrayBuffer());

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
