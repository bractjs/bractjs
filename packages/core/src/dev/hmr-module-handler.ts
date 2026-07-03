import { realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createUseServerProxyPlugin } from "../build/directives.ts";
import { serverModuleStubPlugin } from "../build/env-plugin.ts";

/**
 * Dev-only HTTP handler for /_hmr/module?file=routes/about.tsx
 *
 * Compiles the requested route file on-demand (in-memory, no outdir) and
 * returns it as ESM so the browser can dynamically import it for module swap.
 *
 * Security: rejects any path that resolves outside appDir.
 */
export async function handleHmrModuleRequest(url: URL, appDir: string): Promise<Response> {
  const file = url.searchParams.get("file");
  if (!file) {
    return new Response("Missing file param", { status: 400 });
  }

  // SECURITY(high): restrict to JS/TS source files. Without this, /_hmr/module
  // would build and ship the contents of any file inside appDir (e.g. .env,
  // .json, .md) as JavaScript to the browser — useful only for compiling
  // route modules, so allowlist their extensions.
  if (!/\.(tsx?|jsx?)$/.test(file)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Resolve and guard against path traversal AND symlink escape.
  const rootDir = resolve(appDir);
  const candidate = resolve(join(rootDir, file));
  if (!candidate.startsWith(rootDir + sep) && candidate !== rootDir) {
    return new Response("Forbidden", { status: 403 });
  }
  let fullPath: string;
  try {
    fullPath = await realpath(candidate);
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  if (!fullPath.startsWith(rootDir + sep) && fullPath !== rootDir) {
    return new Response("Forbidden", { status: 403 });
  }

  // SECURITY(high): apply the same client-bundle guard plugins the production
  // build uses. Without these, a route module that imports `*.server.ts` or
  // contains "use server" exports would have that server source compiled and
  // shipped to the browser as JavaScript over /_hmr/module — leaking
  // credentials, DB code, etc. The serverModuleStubPlugin replaces every
  // `*.server.ts` export with an inert stub (zero server source reaches the
  // client) and useServerProxyPlugin rewrites "use server" exports to fetch
  // stubs.
  const result = await Bun.build({
    entrypoints: [fullPath],
    target: "browser",
    minify: false,
    sourcemap: "inline",
    plugins: [serverModuleStubPlugin, createUseServerProxyPlugin(rootDir)],
  });

  if (!result.success || result.outputs.length === 0) {
    const msgs = result.logs.map((l) => String(l)).join("\n");
    return new Response(`Build failed:\n${msgs}`, { status: 500 });
  }

  const js = await result.outputs[0].text();
  return new Response(js, {
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-store",
    },
  });
}
