import { join, basename, extname, resolve } from "node:path";
import { rename, rm } from "node:fs/promises";
import type { BractJSConfig } from "../server/serve.ts";
import { scanRoutes } from "../server/scanner.ts";
import { contentHash } from "./hash.ts";
import { generateManifest, writeManifest } from "./manifest.ts";
import { serverOnlyPlugin, clientEnvPlugin } from "./env-plugin.ts";
import { buildDefines } from "./defines.ts";
import { writeRouteTypes } from "../codegen/route-codegen.ts";
import { useClientStubPlugin, useServerProxyPlugin } from "./directives.ts";
import { cssModulesPlugin } from "./plugins/css-modules.ts";

export async function runBuild(config: BractJSConfig): Promise<void> {
  const appDir = config.appDir ?? "./app";

  // ── 0. Codegen — typed routes ───────────────────────────────────────────
  await writeRouteTypes(appDir);
  const routes = await scanRoutes(appDir);
  const routeFilePaths = routes.map((r) => join(appDir, r.filePath));
  const rootFilePath = join(appDir, "root.tsx");

  // ── 1. Clean stale artefacts ────────────────────────────────────────────
  const buildDir = config.buildDir ?? "build";
  await Promise.all([
    rm(join(buildDir, "client"), { recursive: true, force: true }),
    rm(join(buildDir, "server"), { recursive: true, force: true }),
  ]);

  // ── 2. Server bundle ────────────────────────────────────────────────────
  const pkgRoot = join(import.meta.dir, "../..");
  const serverResult = await Bun.build({
    entrypoints: [join(pkgRoot, "src/server/index.ts")],
    target: "bun",
    outdir: "build/server",
    sourcemap: config.sourcemap ?? "external",
    plugins: [useClientStubPlugin],
  });
  if (!serverResult.success) throw new AggregateError(serverResult.logs, "Server build failed");

  // ── 3. Client bundle (code-split) ───────────────────────────────────────
  const clientResult = await Bun.build({
    entrypoints: [join(pkgRoot, "src/client/entry.tsx"), rootFilePath, ...routeFilePaths],
    target: "browser",
    splitting: true,
    outdir: "build/client",
    // No publicPath: relative chunk refs work correctly when files are served
    // at URLs matching their outdir structure (e.g. /build/client/chunk-xxx.js).
    minify: config.minify ?? true,
    sourcemap: config.sourcemap ?? "external",
    define: buildDefines(config),
    plugins: [serverOnlyPlugin, useServerProxyPlugin, clientEnvPlugin(config.clientEnv ?? [], Bun.env as Record<string, string>), cssModulesPlugin],
  });
  if (!clientResult.success) throw new AggregateError(clientResult.logs, "Client build failed");

  // ── 4. Hash + rename output files ──────────────────────────────────────
  const routeChunks = new Map<string, string>();
  let clientEntry = "";
  let rootChunk: string | undefined;
  const outdirAbs = resolve("build/client");
  const appDirClean = appDir.replace(/^\.\//, "");
  const entryBase = basename("src/client/entry.tsx", extname("src/client/entry.tsx")); // "entry"
  const rootBase = basename(rootFilePath, extname(rootFilePath)); // "root"

  for (const artifact of clientResult.outputs) {
    if (artifact.kind !== "chunk" && artifact.kind !== "entry-point") continue;
    const hash = await contentHash(artifact.path);
    const ext = artifact.path.slice(artifact.path.lastIndexOf("."));
    const base = artifact.path.slice(0, artifact.path.lastIndexOf("."));
    const hashedPath = `${base}.${hash}${ext}`;
    await rename(artifact.path, hashedPath);

    const hashedAbs = resolve(hashedPath);
    const cwdAbs = resolve(".");
    const publicPath = hashedAbs.startsWith(cwdAbs + "/")
      ? "/" + hashedAbs.slice(cwdAbs.length + 1).replace(/\\/g, "/")
      : "/" + hashedPath.replace(/^build\//, "build/");
    const absPath = resolve(artifact.path);
    const rel = absPath.startsWith(outdirAbs + "/") ? absPath.slice(outdirAbs.length + 1) : basename(artifact.path);
    const outBase = basename(artifact.path, extname(artifact.path));

    if (artifact.kind === "entry-point" && outBase === entryBase) {
      clientEntry = publicPath;
    } else if (artifact.kind === "entry-point" && outBase === rootBase) {
      rootChunk = publicPath;
    } else {
      const matched = routes.find((r) => {
        const expected = join(appDirClean, r.filePath).replace(/\.[^.]+$/, ".js");
        return rel === expected;
      });
      if (matched) routeChunks.set(matched.urlPattern, publicPath);
    }
  }

  // ── 5. Write manifest ──────────────────────────────────────────────────
  const manifest = generateManifest({ clientEntry, rootChunk, routeChunks });
  await writeManifest(manifest, "build");
  console.log("[bract] build complete →", Object.keys(manifest.routes).length, "routes");
}
