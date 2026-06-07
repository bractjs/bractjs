import type { BunPlugin } from "bun";
import { relative, resolve, isAbsolute } from "node:path";

const CLIENT_RE = /^["']use client["']/m;
const SERVER_RE = /^["']use server["']/m;

// Strip a UTF-8 BOM and any leading ASCII whitespace before testing the
// directive regex. Editors that save files with BOM otherwise let "use server"
// fall through and ship server code to the client bundle.
function normalizeForDirectiveCheck(src: string): string {
  return src.replace(/^﻿/, "").replace(/^\s+/, "");
}
function hasClientDirective(src: string): boolean {
  return CLIENT_RE.test(normalizeForDirectiveCheck(src));
}
function hasServerDirective(src: string): boolean {
  return SERVER_RE.test(normalizeForDirectiveCheck(src));
}

export function extractExports(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+(?:let|const|var)\s+(\w+)\s*=/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+default\s+(?:async\s+)?function\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+class\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/\bas\s+(\w+)$/);
      if (asMatch) names.push(asMatch[1]);
      else {
        const idMatch = trimmed.match(/^(\w+)/);
        if (idMatch) names.push(idMatch[1]);
      }
    }
  }
  return names;
}

/**
 * Compute stable action ID from a path key (relative when appDir provided)
 * and an exported function name. Server-side counterpart is `computeId` in
 * `src/server/action-registry.ts` — both MUST hash identical input strings
 * or the client proxy hits a 404 at `/_action?id=...`.
 */
async function actionId(pathKey: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(pathKey + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Convert the absolute path Bun's onLoad passes us into the path key we hash
 * for action IDs. When `appDir` is provided, returns appDir-relative path so
 * IDs survive CI→prod machine moves and compiled-binary embedding. Without
 * `appDir`, falls back to the absolute path (legacy behavior).
 */
function pathKeyForAction(absPath: string, appDir?: string): string {
  if (!appDir) return absPath;
  const absAppDir = isAbsolute(appDir) ? appDir : resolve(appDir);
  const rel = relative(absAppDir, absPath);
  // If the file lives outside appDir (escape), `relative` returns a path
  // starting with "..". Fall back to the absolute path so external imports
  // remain hashable but stay distinct from in-tree files.
  return rel.startsWith("..") ? absPath : rel;
}

/** Server build: stub "use client" modules → null components to prevent browser API crashes. */
export const useClientStubPlugin: BunPlugin = {
  name: "bractjs:use-client-stub",
  setup(build) {
    build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async ({ path }) => {
      const src = await Bun.file(path).text();
      if (!hasClientDirective(src)) return undefined;
      const stubs = extractExports(src).map((n) => `export const ${n} = () => null;`).join("\n");
      return { contents: stubs || "export {};", loader: "ts" };
    });
  },
};

// Async fetch helper inlined into every generated "use server" proxy module.
const PROXY_HELPER = `async function __bract(id: string, args: unknown[]): Promise<unknown> {
  const isForm = args.length === 1 && args[0] instanceof FormData;
  const r = await fetch("/_action?id=" + encodeURIComponent(id), {
    method: "POST",
    headers: isForm
      ? { "X-BractJS-Action": "1" }
      : { "Content-Type": "application/json", "X-BractJS-Action": "1" },
    body: isForm ? (args[0] as FormData) : JSON.stringify(args),
  });
  if (!r.ok) throw new Error("[bractjs] action " + id + " failed: " + r.status);
  return r.json() as Promise<unknown>;
}`;

/**
 * Client build: replace "use server" exports with fetch proxy stubs.
 *
 * Factory form so the plugin can compute appDir-relative action IDs that
 * match the server registry across machines and inside compiled binaries.
 * Pass the same `appDir` used by `loadServerActions` on the server.
 */
export function createUseServerProxyPlugin(appDir?: string): BunPlugin {
  return {
    name: "bractjs:use-server-proxy",
    setup(build) {
      build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async ({ path }) => {
        const src = await Bun.file(path).text();
        if (!hasServerDirective(src)) return undefined;
        const names = extractExports(src);
        if (names.length === 0) return { contents: "export {};", loader: "ts" };
        const key = pathKeyForAction(path, appDir);
        const proxies = await Promise.all(
          names.map(async (name) => {
            const id = await actionId(key, name);
            return `export const ${name} = (...args: unknown[]) => __bract("${id}", args);`;
          }),
        );
        return { contents: PROXY_HELPER + "\n" + proxies.join("\n"), loader: "ts" };
      });
    },
  };
}

/**
 * Backwards-compatible default — hashes by absolute path. New code should
 * call `createUseServerProxyPlugin(appDir)` so IDs are stable across the
 * client bundle and server registry regardless of where the build runs.
 */
export const useServerProxyPlugin: BunPlugin = createUseServerProxyPlugin();
