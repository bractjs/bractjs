import { join, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

// Resolve to a canonical path that follows symlinks. Returns null if the
// target doesn't exist OR escapes the given root after symlink expansion.
async function safeRealpath(root: string, requested: string): Promise<string | null> {
  const candidate = resolve(join(root, requested));
  // Cheap structural reject before touching the FS.
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    return null;
  }
  if (!real.startsWith(root + sep) && real !== root) return null;
  return real;
}

/**
 * Serve hashed client assets or public/ files.
 * Returns null if the path doesn't match or the file isn't found.
 * Guards against path traversal AND symlink escape.
 */
export async function serveStatic(
  pathname: string,
  buildDir: string,
  publicDir: string,
): Promise<Response | null> {
  if (pathname.includes("..")) return null;

  if (pathname.startsWith("/build/client/")) {
    const rel = pathname.slice("/build/client/".length);
    const root = resolve(join(buildDir, "client"));
    const full = await safeRealpath(root, rel);
    if (!full) return null;
    const file = Bun.file(full);
    if (!(await file.exists())) return null;
    return new Response(file, { headers: { "Cache-Control": IMMUTABLE } });
  }

  if (pathname.startsWith("/public/")) {
    const rel = pathname.slice("/public/".length);
    const root = resolve(publicDir);
    const full = await safeRealpath(root, rel);
    if (!full) return null;
    const file = Bun.file(full);
    if (!(await file.exists())) return null;
    return new Response(file, { headers: { "Cache-Control": NO_CACHE } });
  }

  return null;
}
