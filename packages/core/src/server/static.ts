import { realpath } from "node:fs/promises";
import { embeddedFile } from "./embedded.ts";
import { join, resolve, sep } from "node:path";
import { isDevRuntime } from "./env.ts";
import { fileBody, fileExists } from "./runtime.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

// Stop browsers from MIME-sniffing a static file into a more dangerous type
// (e.g. treating an uploaded asset as HTML/JS). Cheap defense-in-depth on every
// static response, including user-uploaded files served from public/.
const NOSNIFF = "nosniff";

// Hashed client chunks are safe to cache forever in production (a content change
// yields a new filename). In DEV, however, the dev rebuilder can reuse a chunk
// filename across rebuilds while its contents change, so marking them immutable
// makes the browser pin stale JS (e.g. an old route matcher) for a year. Serve
// them no-cache in dev so each rebuild is picked up.
function clientAssetCacheControl(): string {
  return isDevRuntime() ? NO_CACHE : IMMUTABLE;
}

/**
 * Resolve to a canonical path that follows symlinks, with a fallback for
 * `bun build --compile` binaries.
 *
 * Three outcomes:
 * 1. realpath succeeds + stays inside `root` → return resolved path
 * 2. realpath throws AND the file exists → return the candidate
 *    path. This is the embedded-asset case: `bun --compile` exposes assets
 *    through virtual paths that don't appear in the filesystem, so realpath
 *    errors with ENOENT/EINVAL but Bun's file API still reads them.
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
    // the runtime's file check, which reads from the embed table.
    if (await fileExists(candidate)) return candidate;
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

/**
 * Percent-decode a request pathname for a filesystem lookup. `null` for a
 * malformed escape or an embedded NUL (never a legitimate file name). Callers
 * run every traversal guard on the DECODED value.
 */
export function decodePathname(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // NUL is never a file name; a decoded backslash (`%5C`) is a path separator
  // on Windows that the `/`-based segment guards would not see.
  return decoded.includes("\0") || decoded.includes("\\") ? null : decoded;
}

export async function serveStatic(
  rawPathname: string,
  buildDir: string,
  publicDir: string,
): Promise<Response | null> {
  // `url.pathname` keeps its percent-encoding: "/public/my%20file.png" must
  // find "my file.png" on disk. Decode once, then guard the decoded path.
  const pathname = decodePathname(rawPathname);
  if (pathname === null) return null;
  if (hasDotDotSegment(pathname)) return null;

  if (pathname.startsWith("/build/client/")) {
    const rel = pathname.slice("/build/client/".length);
    const root = resolve(join(buildDir, "client"));
    // Compiled binary: the client build travels inside the executable.
    const embedded = embeddedFile(root, rel);
    if (embedded) {
      return new Response(embedded, {
        headers: { "Cache-Control": clientAssetCacheControl(), "X-Content-Type-Options": NOSNIFF },
      });
    }
    const full = await safeRealpath(root, rel);
    if (!full) return null;
    const file = await fileBody(full);
    if (!file) return null;
    return new Response(file.body, {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": clientAssetCacheControl(),
        "X-Content-Type-Options": NOSNIFF,
      },
    });
  }

  if (pathname.startsWith("/public/")) {
    const rel = pathname.slice("/public/".length);
    const root = resolve(publicDir);
    const embedded = embeddedFile(root, rel);
    if (embedded) {
      return new Response(embedded, {
        headers: { "Cache-Control": NO_CACHE, "X-Content-Type-Options": NOSNIFF },
      });
    }
    const full = await safeRealpath(root, rel);
    if (!full) return null;
    const file = await fileBody(full);
    if (!file) return null;
    return new Response(file.body, {
      headers: { "Content-Type": file.type, "Cache-Control": NO_CACHE, "X-Content-Type-Options": NOSNIFF },
    });
  }

  return null;
}
