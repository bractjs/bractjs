import { mkdir, rename, rm } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { createUseServerProxyPlugin } from "../build/directives.ts";
import { clientEnvPlugin, serverModuleStubPlugin } from "../build/env-plugin.ts";
import { generateManifest, writeManifest } from "../build/manifest.ts";
import { cssModulesPlugin } from "../build/plugins/css-modules.ts";
import { routeShakePlugin } from "../build/plugins/route-shake.ts";
import { reactDedupePlugin } from "../build/react-dedupe.ts";
import { scanRoutes } from "../server/scanner.ts";
import type { BractJSConfig } from "../server/serve.ts";

// Shim filename written inside the demo app's CWD during build (then deleted).
// The framework's entry.tsx lives outside CWD. When Bun sees entrypoints outside
// CWD it picks a common-ancestor project root, placing the entry at a nested
// virtual path and generating ../ traversals in chunk imports. Those traversals
// produce wrong URLs after we rename entry.js → client.js. A shim inside CWD
// keeps all entrypoints under one root so chunk refs stay flat and correct.
const SHIM = ".bractjs-entry.tsx";

export async function rebuildClient(config?: Partial<BractJSConfig>): Promise<{ duration: number }> {
  const start = Date.now();
  const appDir = config?.appDir ?? "./app";
  const pkgRoot = resolve(import.meta.dirname, "../..");
  const outdir = resolve(process.cwd(), config?.buildDir ?? "build", "client");
  const buildDir = resolve(process.cwd(), config?.buildDir ?? "build");
  const entrypoint = resolve(pkgRoot, "src/client/entry.tsx");

  // Clean output dir so stale artifacts from previous builds can't be served.
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const routes = await scanRoutes(appDir);
  const routePaths = routes.map((r) => resolve(process.cwd(), appDir, r.filePath));
  const rootPath = resolve(process.cwd(), appDir, "root.tsx");
  const appDirClean = appDir.replace(/^\.\//, ""); // "./app" → "app"

  // Write shim, build, always delete shim.
  const shimPath = resolve(process.cwd(), SHIM);
  await Bun.write(shimPath, `import "${entrypoint}";\nexport {};\n`);

  let result: Awaited<ReturnType<typeof Bun.build>>;
  try {
    result = await Bun.build({
      entrypoints: [shimPath, rootPath, ...routePaths],
      target: "browser",
      splitting: true, // shared React chunk prevents dual-React / invalid hook call
      outdir,
      // No publicPath: relative refs resolve correctly because static.ts serves
      // /build/client/ directly from outdir, so the URL structure matches the file
      // structure. publicPath + ../ traversals produce wrong absolute URLs.
      minify: false,
      sourcemap: "inline",
      // SECURITY: mirror the production client-bundle guard plugins
      // (src/build/bundler.ts). Without `serverModuleStubPlugin` a route that
      // imports a `*.server.ts` module would have that server source compiled
      // and served to the browser over /build/client in dev; without
      // `clientEnvPlugin` server env vars would leak the same way.
      plugins: [
        reactDedupePlugin(process.cwd()),
        serverModuleStubPlugin,
        createUseServerProxyPlugin(appDir),
        routeShakePlugin(appDir),
        clientEnvPlugin(config?.clientEnv ?? [], Bun.env as Record<string, string>),
        cssModulesPlugin,
        ...(config?.plugins ?? []),
      ],
    });
  } finally {
    await rm(shimPath, { force: true });
  }

  if (!result.success) {
    for (const log of result.logs) console.error("[bractjs] build error:", log);
    return { duration: Date.now() - start };
  }

  const routeChunks = new Map<string, string>();
  const clientEntry = "/build/client/client.js";
  const shimBase = basename(SHIM, extname(SHIM)); // ".bractjs-entry"
  let rootChunk: string | undefined;

  for (const output of result.outputs) {
    if (output.kind !== "entry-point") continue;
    const outBase = basename(output.path, extname(output.path));
    // rel: path of this output relative to outdir, e.g. "app/routes/_index.js"
    const rel = output.path.slice(outdir.length + 1);

    if (outBase === shimBase) {
      // Rename shim output → client.js
      const target = join(outdir, "client.js");
      if (output.path !== target) await rename(output.path, target);
    } else if (rel === join(appDirClean, "root.js")) {
      // Root component chunk — the shell that wraps <Outlet />
      rootChunk = "/build/client/" + rel;
    } else {
      // Match by full relative path to avoid basename collisions (_index appears N times).
      // Input: appDirClean/r.filePath. Output mirrors that structure under outdir.
      const matched = routes.find((r) => {
        const expected = join(appDirClean, r.filePath).replace(/\.[^.]+$/, ".js");
        return rel === expected;
      });
      if (matched) {
        routeChunks.set(matched.urlPattern, "/build/client/" + rel);
      }
    }
  }

  await writeManifest(generateManifest({ clientEntry, rootChunk, routeChunks }), buildDir);
  return { duration: Date.now() - start };
}
