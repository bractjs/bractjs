import { join, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

/**
 * Resolve to a canonical path that follows symlinks, with a fallback for
 * `bun build --compile` binaries.
 *
 * Three outcomes:
 * 1. realpath succeeds + stays inside `root` → return resolved path
 * 2. realpath throws AND `Bun.file(candidate)` exists → return the candidate
 *    path. This is the embedded-asset case: `bun --compile` exposes assets
 *    through virtual paths that don't appear in the filesystem, so realpath
 *    errors with ENOENT/EINVAL but `Bun.file()` still reads them.
 * 3. otherwise → null (escape, ENOENT, etc.)
 *
 * The structural `startsWith(root + sep)` check at the top runs before any
 * I/O and is the authoritative traversal guard — the realpath check is
 * defense-in-depth against symlink escape, which can't happen inside an
 * embedded virtual filesystem.
 */
async function safeRealpath(root: string, requested: string): Promise<string | null> {
  const candidate = resolve(join(root, requested));
  // Cheap structural reject before touching the FS. This blocks `..` escapes
  // unconditionally, in both the normal-FS and embedded-binary paths.
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  try {
    const real = await realpath(candidate);
    if (!real.startsWith(root + sep) && real !== root) return null;
    return real;
  } catch {
    // realpath fails for paths embedded by `bun build --compile --asset`.
    // The structural check above already prevented traversal, so the only
    // remaining concern is whether the asset actually exists — defer to
    // Bun.file() which reads from the embed table.
    if (await Bun.file(candidate).exists()) return candidate;
    return null;
  }
}

/**
 * Serve hashed client assets or public/ files.
 * Returns null if the path doesn't match or the file isn't found.
 * Guards against path traversal AND symlink escape.
 */
// Reject only `..` as a full path segment (e.g. "/a/../b"), not legitimate
// filenames that happen to contain ".." as a substring like "file..backup.txt".
// safeRealpath() is the authoritative escape check; this is defense-in-depth.
function hasDotDotSegment(pathname: string): boolean {
  return pathname.split("/").includes("..");
}

export async function serveStatic(
  pathname: string,
  buildDir: string,
  publicDir: string,
): Promise<Response | null> {
  if (hasDotDotSegment(pathname)) return null;

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
