import { extname, basename, dirname, join } from "node:path";

// ── Helpers ────────────────────────────────────────────────────────────────

async function digestToHex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Public API ─────────────────────────────────────────────────────────────

/** SHA-256 of file contents → first 8 hex chars. */
export async function contentHash(filePath: string): Promise<string> {
  const buffer = await Bun.file(filePath).arrayBuffer();
  return (await digestToHex(buffer)).slice(0, 8);
}

/** SHA-256 of a string → first 8 hex chars. */
export async function hashString(content: string): Promise<string> {
  const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
  return (await digestToHex(buffer)).slice(0, 8);
}

/**
 * Inserts the content hash before the file extension.
 * Example: client.js → client.abc12345.js
 * Returns the new path (does NOT rename on disk).
 */
export async function renameWithHash(filePath: string): Promise<string> {
  const hash = await contentHash(filePath);
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  return join(dirname(filePath), `${base}.${hash}${ext}`);
}
