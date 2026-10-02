import type { BunPlugin } from "bun";
import { relative, resolve, isAbsolute } from "node:path";
import { hasClientDirective, hasServerDirective, isActionModulePath } from "../shared/directives.ts";

// Re-exported for existing importers (use-client-runtime.ts); the shared
// module in src/shared/directives.ts is the single source of truth, keeping
// these plugins in lockstep with the runtime action registry and codegen.
export { hasClientDirective, hasServerDirective };

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
  // A FormData anywhere in the arguments — <form action={fn}> passes
  // (formData), React 19's useActionState passes (prevState, formData) — goes
  // as multipart: the JSON argument list with each form replaced by a marker,
  // and the forms' entries (files included) prefixed with their position.
  // The server rebuilds the same arguments (server/action-handler.ts).
  const hasForm = args.some((a) => a instanceof FormData);
  let body: BodyInit;
  const headers: Record<string, string> = { "X-BractJS-Action": "1" };
  if (hasForm) {
    const fd = new FormData();
    fd.append("__bract_args", JSON.stringify(args.map((a, i) => (a instanceof FormData ? { $bractForm: i } : a))));
    args.forEach((a, i) => {
      if (a instanceof FormData) for (const [k, v] of a.entries()) fd.append(i + ":" + k, v);
    });
    body = fd;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(args);
  }
  const r = await fetch("/_action?id=" + encodeURIComponent(id), { method: "POST", headers, body });
  const router = (globalThis as { __BRACTJS_ROUTER__?: {
    revalidate(info?: { formMethod?: string; formAction?: string }): Promise<void>;
    navigate(to: string): Promise<void>;
  } }).__BRACTJS_ROUTER__;
  // A redirect from the action: follow it like a <Form> submission would.
  const location = r.headers.get("X-BractJS-Redirect");
  if (location) {
    if (router) await router.navigate(location);
    else window.location.assign(location);
    return undefined;
  }
  if (!r.ok) {
    let message = "[bractjs] action " + id + " failed: " + r.status;
    try {
      const data = (await r.clone().json()) as { error?: string };
      if (data && typeof data.error === "string") message = data.error;
    } catch {}
    throw Object.assign(new Error(message), { status: r.status });
  }
  const result = await r.json();
  // The action probably changed data the page shows: re-run its loaders, as
  // after a <Form> submission. Awaited, so a useActionState transition settles
  // with the new result and the fresh page data together.
  await router?.revalidate({ formMethod: "POST", formAction: "/_action" });
  return result;
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
        // Still proxied (server source never ships), but the server won't
        // publish it: say so instead of letting every call 404.
        if (appDir && !key.startsWith("/") && !isActionModulePath(key)) warnIgnoredActionModule(key);
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

const warnedActionModules = new Set<string>();
function warnIgnoredActionModule(rel: string): void {
  if (warnedActionModules.has(rel)) return;
  warnedActionModules.add(rel);
  console.warn(
    `[bractjs] "use server" in ${rel} is ignored: server actions must live in a route module ` +
      `(routes/…) or a *.server.ts file. Rename it to ${rel.replace(/\.(tsx?)$/, ".server.$1")} — ` +
      `until then, every call to its actions returns 404.`,
  );
}

/**
 * Backwards-compatible default — hashes by absolute path. New code should
 * call `createUseServerProxyPlugin(appDir)` so IDs are stable across the
 * client bundle and server registry regardless of where the build runs.
 */
export const useServerProxyPlugin: BunPlugin = createUseServerProxyPlugin();
