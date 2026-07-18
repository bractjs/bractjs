import { isAbsolute, join, relative, resolve } from "node:path";
import { hasServerDirective } from "../shared/directives.ts";
import { devBustedSpecifier } from "./env.ts";

const registry = new Map<string, (...args: unknown[]) => Promise<unknown>>();

/**
 * Internal: empty the action registry. Used by the dev watcher before a
 * re-scan (so deleted/renamed "use server" modules don't linger) and by tests
 * for isolation. Not part of the public API.
 */
export function clearActionRegistry(): void {
  registry.clear();
}

// SECURITY(high): exporting a function from a `"use server"` module publishes
// it as an unauthenticated RPC endpoint reachable via POST /_action and
// GET /_stream. For files under `routes/`, these reserved exports are framework
// lifecycle hooks / components — NOT intended as callable actions — so we never
// register them. Without this filter a route's `loader`/`action`/`default`
// could be invoked directly over the wire, bypassing search/param validation
// and (for /_stream) with zero arguments. Authors who genuinely want an action
// must export it under a different name.
const RESERVED_ROUTE_EXPORTS = new Set([
  "default",
  "loader",
  "action",
  "meta",
  "beforeLoad",
  "context",
  "ErrorBoundary",
  "Fallback",
  "config",
  "searchSchema",
  "ssr",
]);

function isRouteFile(rel: string): boolean {
  return rel.startsWith("routes/") || rel.startsWith("routes\\");
}

function shouldRegisterExport(name: string, fromRouteFile: boolean): boolean {
  if (fromRouteFile && RESERVED_ROUTE_EXPORTS.has(name)) return false;
  return true;
}

/**
 * Hash key for an action — must use the same string the client-side proxy
 * plugin hashes (`pathKey + "#" + name`). Mismatch → `/_action?id=...` 404.
 */
async function computeId(pathKey: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(pathKey + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Convert an absolute file path to the appDir-relative key used for hashing.
 * Matches `pathKeyForAction` in `src/build/directives.ts`. Files outside
 * appDir keep their absolute path so external imports stay hashable but
 * distinct from in-tree files.
 */
function pathKeyForAction(absPath: string, appDir: string): string {
  const absAppDir = isAbsolute(appDir) ? appDir : resolve(appDir);
  const rel = relative(absAppDir, absPath);
  return rel.startsWith("..") ? absPath : rel;
}

export function resolveAction(id: string): ((...args: unknown[]) => Promise<unknown>) | null {
  return registry.get(id) ?? null;
}

function isEligible(rel: string): boolean {
  return (
    rel.endsWith(".server.ts") ||
    rel.endsWith(".server.tsx") ||
    rel.startsWith("routes/") ||
    rel.startsWith("routes\\")
  );
}

export async function loadServerActions(appDir: string): Promise<void> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for await (const rel of glob.scan(appDir)) {
    if (!isEligible(rel)) continue;
    const filePath = join(appDir, rel);
    let src: string;
    try {
      src = await Bun.file(filePath).text();
    } catch {
      continue;
    }
    if (!hasServerDirective(src)) continue;

    let mod: Record<string, unknown>;
    try {
      // Dev: cache-busted so edited "use server" bodies are live after re-scan.
      const spec = devBustedSpecifier(filePath);
      mod = (await import(spec)) as Record<string, unknown>;
    } catch (err) {
      console.error("[bractjs] failed to load server actions from", rel, err);
      continue;
    }

    const fromRouteFile = isRouteFile(rel);
    for (const [name, val] of Object.entries(mod)) {
      if (typeof val !== "function") continue;
      if (!shouldRegisterExport(name, fromRouteFile)) continue;
      const id = await computeId(pathKeyForAction(filePath, appDir), name);
      registry.set(id, val as (...args: unknown[]) => Promise<unknown>);
    }
  }
}

/**
 * Registry-driven counterpart to `loadServerActions`. Skips the filesystem
 * scan and dynamic imports — every entry was already statically imported by
 * `_generated/actions.ts`, so we just iterate and register.
 *
 * Each entry's `relPath` MUST be appDir-relative (matches what
 * `createUseServerProxyPlugin(appDir)` hashed during the client build).
 * Mismatched relPaths produce silent `/_action?id=...` 404s.
 */
export async function loadServerActionsFromRegistry(
  entries: Array<{ relPath: string; mod: Record<string, unknown> }>,
): Promise<void> {
  for (const { relPath, mod } of entries) {
    const fromRouteFile = isRouteFile(relPath);
    for (const [name, val] of Object.entries(mod)) {
      if (typeof val !== "function") continue;
      if (!shouldRegisterExport(name, fromRouteFile)) continue;
      const id = await computeId(relPath, name);
      registry.set(id, val as (...args: unknown[]) => Promise<unknown>);
    }
  }
}
