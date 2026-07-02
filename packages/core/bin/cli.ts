#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const command = process.argv[2];

// ── new <app-name> ──────────────────────────────────────────────────────────

async function scaffoldNew(appName: string): Promise<void> {
  if (!appName) {
    console.error("Usage: bractjs new <app-name>");
    process.exit(1);
  }

  const appDir = resolve(process.cwd(), appName);
  if (existsSync(appDir)) {
    console.error(`Directory "${appName}" already exists.`);
    process.exit(1);
  }

  const templateDir = join(import.meta.dirname, "../templates/new-app");
  // Absolute path to the bractjs package itself — used as a file: dep before npm publish
  const bractPackageDir = resolve(import.meta.dirname, "..");
  console.log(`Creating ${appName}...`);

  // Recursively copy template files, substituting {{APP_NAME}} and {{BRACT_PATH}}
  await copyDir(templateDir, appDir, appName, bractPackageDir);

  // Install dependencies
  console.log("Installing dependencies...");
  const result = Bun.spawnSync(["bun", "install"], { cwd: appDir, stdio: ["inherit", "inherit", "inherit"] });
  if (result.exitCode !== 0) {
    console.error("bun install failed.");
    process.exit(result.exitCode ?? 1);
  }

  // Seed `app/_generated/` so the template's `app/server.ts` typechecks
  // before the user runs a build. Only the route/action registries can run
  // here (no manifest yet — that needs `bractjs build` first). The manifest
  // module is stubbed in below.
  console.log("Seeding _generated/ registries...");
  try {
    const { writeModuleRegistries } = await import("../src/codegen/module-registry.ts");
    await writeModuleRegistries(join(appDir, "app"));
    // Generate typed routes so the scaffold has working <Link>/useParams typing
    // out of the box (no manual `bractjs codegen` step before first dev run).
    const { writeRouteTypes } = await import("../src/codegen/route-codegen.ts");
    await writeRouteTypes(join(appDir, "app"));
    // Manifest stub — overwritten by `bractjs codegen:manifest` after a build
    const stubManifest = [
      "// Stub manifest — replaced by `bractjs codegen:manifest` after running",
      "// `bractjs build`. Allows `app/server.ts` to typecheck before the",
      "// first build completes.",
      `import type { ServerManifest } from "@bractjs/bractjs";`,
      `export const manifest: ServerManifest = { clientEntry: "/build/client/client.js", routes: {} };`,
      "",
    ].join("\n");
    await Bun.write(join(appDir, "app", "_generated", "manifest.ts"), stubManifest);
  } catch (err) {
    console.warn("[bract] codegen seed skipped:", err instanceof Error ? err.message : err);
  }

  console.log(`\n✓ Created ${appName}\n`);
  console.log("Next steps:");
  console.log(`  cd ${appName}`);
  console.log("  bun run dev");
}

async function copyDir(src: string, dest: string, appName: string, bractPath: string): Promise<void> {
  const glob = new Bun.Glob("**/*");
  for await (const rel of glob.scan({ cwd: src, onlyFiles: true })) {
    const srcPath = join(src, rel);
    const destPath = join(dest, rel);
    // Ensure parent directory exists
    const parentDir = destPath.slice(0, destPath.lastIndexOf("/"));
    await Bun.write(destPath, ""); // creates parent dirs
    let content = await Bun.file(srcPath).text();
    content = content.replaceAll("{{APP_NAME}}", appName);
    content = content.replaceAll("{{BRACT_PATH}}", bractPath);
    await Bun.write(destPath, content);
  }
}

// ── dispatch ────────────────────────────────────────────────────────────────

switch (command) {
  case "new":
    await scaffoldNew(process.argv[3]);
    break;

  case "dev": {
    // Ensure dev-only handlers gated by isExplicitDev() (e.g. /_hmr/module,
    // /_bractjs/devtools.js) are reachable when the user hasn't set NODE_ENV.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
    const { createDevServer, DevServerError } = await import("../src/dev/server.ts");
    try {
      await createDevServer();
    } catch (err) {
      // User-actionable startup failures (port conflicts) get the message
      // without a stack; anything else is a real bug and should blow up loud.
      if (err instanceof DevServerError) {
        console.error(`[bractjs] ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    break;
  }

  case "build": {
    // Force production so React's conditional exports resolve to the prod
    // server build (react-dom/server.bun production) instead of the dev one.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    const { runBuild } = await import("../src/build/bundler.ts");
    const { loadUserConfig } = await import("../src/config/load.ts");
    const userCfg = await loadUserConfig();
    await runBuild({ appDir: "./app", buildDir: "./build", ...userCfg });
    if (userCfg.prerender) {
      const { runPrerender } = await import("../src/build/prerender.ts");
      const { written } = await runPrerender({
        prerender: userCfg.prerender,
        appDir: userCfg.appDir ?? "./app",
        publicDir: userCfg.publicDir,
        buildDir: userCfg.buildDir ?? "./build",
      });
      console.log(`[bract] prerender → ${written.length} files`);
    }
    break;
  }

  case "start": {
    // Default to production so SSR-side gates (e.g. <LiveReload/>) emit prod
    // output. Users can still override with `NODE_ENV=staging bractjs start`.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    const { createServer } = await import("../src/server/serve.ts");
    const { loadUserConfig } = await import("../src/config/load.ts");
    // The config carries runtime-relevant fields too (ssr, port, dirs).
    const userCfg = await loadUserConfig();
    createServer({ port: 3000, buildDir: "./build", ...userCfg });
    break;
  }

  case "codegen": {
    const { writeRouteTypes } = await import("../src/codegen/route-codegen.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    const outPath = process.argv[4] ? resolve(process.cwd(), process.argv[4]) : undefined;
    await writeRouteTypes(appDir, outPath);
    break;
  }

  case "codegen:registry": {
    // Phase A of the `bun build --compile` pipeline: scan routes/layouts and
    // server actions, then write static-import registries under
    // `<appDir>/_generated/` so the resulting bundle has no fs-scan or
    // `import(absPath)` calls at runtime.
    const { writeModuleRegistries } = await import("../src/codegen/module-registry.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    const { routesPath, actionsPath } = await writeModuleRegistries(appDir);
    console.log("[bract] registry codegen →", routesPath);
    console.log("[bract] registry codegen →", actionsPath);
    break;
  }

  case "codegen:manifest": {
    // Phase C of the pipeline: snapshot `<buildDir>/route-manifest.json`
    // into `<appDir>/_generated/manifest.ts` so the compiled binary never
    // reads the JSON from disk at startup. Must run AFTER the client build.
    const { writeManifestModule } = await import("../src/codegen/module-registry.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    const buildDir = resolve(process.cwd(), process.argv[4] ?? "./build");
    const out = await writeManifestModule(appDir, buildDir);
    console.log("[bract] manifest codegen →", out);
    break;
  }

  case "compile": {
    // Convenience: run the entire `bun build --compile` pipeline.
    // A) registry codegen → B) client build → C) manifest codegen → D) compile.
    // The user can also invoke A/C and D separately if they want a custom
    // client build step.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    const { writeModuleRegistries, writeManifestModule } = await import("../src/codegen/module-registry.ts");
    const { runBuild } = await import("../src/build/bundler.ts");
    const { loadUserConfig } = await import("../src/config/load.ts");

    const appDir = resolve(process.cwd(), "./app");
    const buildDir = resolve(process.cwd(), "./build");
    const outFile = process.argv[3] ?? "./bractjs-app";
    const entryPath = process.argv[4] ?? "./app/server.ts";

    console.log("[bract] (1/4) registry codegen…");
    await writeModuleRegistries(appDir);

    console.log("[bract] (2/4) client + server build…");
    const userCfg = await loadUserConfig();
    await runBuild({ appDir: "./app", buildDir: "./build", ...userCfg });

    console.log("[bract] (3/4) manifest codegen…");
    await writeManifestModule(appDir, buildDir);

    console.log("[bract] (4/4) bun build --compile →", outFile);
    const result = Bun.spawnSync(
      [
        "bun",
        "build",
        "--compile",
        // Bun executables disable tsconfig autoload by default. Re-enable it so
        // React TSX keeps using the app's jsx settings at runtime.
        "--compile-autoload-tsconfig",
        entryPath,
        "--outfile",
        outFile,
      ],
      {
        cwd: process.cwd(),
        stdio: ["inherit", "inherit", "inherit"],
        env: {
          ...process.env,
          // Bun executable compile currently miscompiles React TSX under
          // NODE_ENV=production (emits jsxDEV calls against a runtime that
          // doesn't provide jsxDEV). Force a safe compile-time env while still
          // keeping Bract's client/server build phase in production mode.
          NODE_ENV: "development",
        },
      },
    );
    if (result.exitCode !== 0) {
      console.error("[bract] bun build --compile failed");
      process.exit(result.exitCode ?? 1);
    }
    console.log(`[bract] ✓ single-binary build complete: ${outFile}`);
    break;
  }

  default:
    console.log(
      "Usage: bractjs <command>\n" +
        "  new      <app-name>            Scaffold a new BractJS app\n" +
        "  dev                            Start dev server with HMR\n" +
        "  build                          Build for production (build/ dir)\n" +
        "  start                          Start production server\n" +
        "  codegen  [app] [out]           Generate typed route types\n" +
        "  codegen:registry  [app]        Generate _generated/{routes,actions}.ts\n" +
        "  codegen:manifest  [app] [build]  Generate _generated/manifest.ts\n" +
        "  compile  [outfile] [entry]     Full single-binary pipeline",
    );
    process.exit(1);
}
