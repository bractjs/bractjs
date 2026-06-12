import { join, basename, extname, resolve } from "node:path";
import { rename, rm } from "node:fs/promises";
import type { BunPlugin } from "bun";
import { scanRoutes } from "../server/scanner.ts";
import { contentHash } from "./hash.ts";
import { generateManifest, writeManifest } from "./manifest.ts";
import { serverModuleStubPlugin, clientEnvPlugin } from "./env-plugin.ts";
import { buildDefines } from "./defines.ts";
import { writeRouteTypes } from "../codegen/route-codegen.ts";
import { useClientStubPlugin, createUseServerProxyPlugin } from "./directives.ts";
import { cssModulesPlugin } from "./plugins/css-modules.ts";
import { reactDedupePlugin } from "./react-dedupe.ts";

/** Subset of config fields relevant to the build pipeline. */
export interface BuildConfig {
  appDir?: string;
  buildDir?: string;
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  plugins?: BunPlugin[];
  /** SPA mode: when `false`, the build also emits the static document shell. */
  ssr?: boolean;
}

export async function runBuild(config: BuildConfig): Promise<void> {
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
    // Force production so Bun picks the `jsx`/`jsxs` runtime instead of
    // `jsxDEV` — `jsxDEV` only exists on react/jsx-dev-runtime, which is a
    // no-op when bundled under NODE_ENV=production, leaving the call site
    // calling an undefined function. Same fix applied to the client bundle
    // implicitly via buildDefines().
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [useClientStubPlugin],
  });
  if (!serverResult.success) throw new AggregateError(serverResult.logs, "Server build failed");

  // ── 3. Client bundle (code-split) ───────────────────────────────────────
  // The framework's entry.tsx lives OUTSIDE the user's cwd (in pkgRoot). When
  // Bun sees an entrypoint outside cwd it roots outputs at a common ancestor,
  // emitting the entry at a nested path (build/client/src/client/entry.js) and
  // baking ../ traversals into chunk refs — which makes `clientEntry` resolve to
  // a URL that doesn't exist (e.g. /src/client/entry.<hash>.js). A shim file
  // inside cwd keeps every entrypoint under one root so the entry output is flat
  // and chunk refs stay correct. (Same technique as the dev rebuilder.)
  const SHIM = ".bractjs-entry.tsx";
  const shimPath = resolve(process.cwd(), SHIM);
  await Bun.write(shimPath, `import "${join(pkgRoot, "src/client/entry.tsx")}";\nexport {};\n`);
  const shimBase = basename(SHIM, extname(SHIM)); // ".bractjs-entry"

  let clientResult: Awaited<ReturnType<typeof Bun.build>>;
  try {
    clientResult = await Bun.build({
      entrypoints: [shimPath, rootFilePath, ...routeFilePaths],
      target: "browser",
      splitting: true,
      outdir: "build/client",
      // No publicPath: relative chunk refs work correctly when files are served
      // at URLs matching their outdir structure (e.g. /build/client/chunk-xxx.js).
      minify: config.minify ?? true,
      sourcemap: config.sourcemap ?? "external",
      define: buildDefines(config),
      plugins: [reactDedupePlugin(process.cwd()), serverModuleStubPlugin, createUseServerProxyPlugin(appDir), clientEnvPlugin(config.clientEnv ?? [], Bun.env as Record<string, string>), cssModulesPlugin, ...(config.plugins ?? [])],
    });
  } finally {
    await rm(shimPath, { force: true });
  }
  if (!clientResult.success) throw new AggregateError(clientResult.logs, "Client build failed");

  // ── 4. Hash + rename output files ──────────────────────────────────────
  const routeChunks = new Map<string, string>();
  let clientEntry = "";
  let rootChunk: string | undefined;
  const outdirAbs = resolve("build/client");
  const appDirClean = appDir.replace(/^\.\//, "");
  const rootBase = basename(rootFilePath, extname(rootFilePath)); // "root"

  for (const artifact of clientResult.outputs) {
    // Only rename entry points. Bun's split chunks (kind === "chunk") already
    // have content-hashed basenames (e.g. chunk-189z661a.js); renaming them
    // would break sibling import refs, which Bun bakes in at bundle time and
    // does NOT rewrite after rename.
    if (artifact.kind !== "entry-point") continue;
    // Compute the source-relative path BEFORE renaming, to classify the output.
    const absPath = resolve(artifact.path);
    const rel = absPath.startsWith(outdirAbs + "/") ? absPath.slice(outdirAbs.length + 1) : basename(artifact.path);
    const outBase = basename(artifact.path, extname(artifact.path));
    const hash = await contentHash(artifact.path);
    const ext = artifact.path.slice(artifact.path.lastIndexOf("."));

    // The shim is the real client entry — rename it to a flat client.<hash>.js
    // at the outdir root so its URL is /build/client/client.<hash>.js.
    if (outBase === shimBase) {
      const hashedPath = join(outdirAbs, `client.${hash}${ext}`);
      await rename(artifact.path, hashedPath);
      clientEntry = "/build/client/" + basename(hashedPath);
      continue;
    }

    const base = artifact.path.slice(0, artifact.path.lastIndexOf("."));
    const hashedPath = `${base}.${hash}${ext}`;
    await rename(artifact.path, hashedPath);

    const hashedAbs = resolve(hashedPath);
    const cwdAbs = resolve(".");
    const publicPath = hashedAbs.startsWith(cwdAbs + "/")
      ? "/" + hashedAbs.slice(cwdAbs.length + 1).replace(/\\/g, "/")
      : "/" + hashedPath.replace(/^build\//, "build/");

    if (outBase === rootBase) {
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
  const manifest = generateManifest({ clientEntry, rootChunk, routeChunks, mode: "production" });
  await writeManifest(manifest, "build");

  // ── 6. SPA shell (ssr: false) ───────────────────────────────────────────
  // Emit the static document shell every document GET will serve in SPA mode.
  if (config.ssr === false) {
    const { renderSpaShell } = await import("../server/spa.ts");
    const { installUseClientServerStub } = await import("../server/use-client-runtime.ts");
    // root.tsx is imported from source here — "use client" components inside
    // it must null-render exactly as they do on the running server.
    installUseClientServerStub(appDir);
    const serverManifest = {
      clientEntry,
      rootChunk,
      routes: Object.fromEntries(
        Object.entries(manifest.routes).map(([pat, e]) => [pat, { file: e.chunk, chunk: e.chunk }]),
      ),
    };
    const html = await renderSpaShell(appDir, serverManifest);
    await Bun.write(join(buildDir, "client", "__spa.html"), html);
    console.log("[bract] SPA shell → build/client/__spa.html");
  }

  console.log("[bract] build complete →", Object.keys(manifest.routes).length, "routes");
}
