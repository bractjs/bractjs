import { join, resolve } from "node:path";

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

/**
 * Serve hashed client assets or public/ files.
 * Returns null if the path doesn't match or the file isn't found.
 * Guards against path traversal by resolving and prefix-checking.
 */
export async function serveStatic(
  pathname: string,
  buildDir: string,
  publicDir: string,
): Promise<Response | null> {
  // Security: reject traversal sequences before any path resolution
  if (pathname.includes("..")) return null;

  if (pathname.startsWith("/build/client/")) {
    const rel = pathname.slice("/build/client/".length);
    const root = resolve(join(buildDir, "client"));
    const full = resolve(join(root, rel));
    if (!full.startsWith(root + "/") && full !== root) return null;
    const file = Bun.file(full);
    if (!(await file.exists())) return null;
    return new Response(file, { headers: { "Cache-Control": IMMUTABLE } });
  }

  if (pathname.startsWith("/public/")) {
    const rel = pathname.slice("/public/".length);
    const root = resolve(publicDir);
    const full = resolve(join(root, rel));
    if (!full.startsWith(root + "/") && full !== root) return null;
    const file = Bun.file(full);
    if (!(await file.exists())) return null;
    return new Response(file, { headers: { "Cache-Control": NO_CACHE } });
  }

  return null;
}
