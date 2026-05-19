#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
export {}; // make this file a module

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

  case "dev":
    // Ensure dev-only handlers gated by isExplicitDev() (e.g. /_hmr/module,
    // /_bractjs/devtools.js) are reachable when the user hasn't set NODE_ENV.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
    const { createDevServer } = await import("../src/dev/server.ts");
    await createDevServer();
    break;

  case "build": {
    // Force production so React's conditional exports resolve to the prod
    // server build (react-dom/server.bun production) instead of the dev one.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    const { runBuild } = await import("../src/build/bundler.ts");
    const { loadUserConfig } = await import("../src/config/load.ts");
    const userCfg = await loadUserConfig();
    await runBuild({ appDir: "./app", buildDir: "./build", ...userCfg });
    break;
  }

  case "start": {
    // Default to production so SSR-side gates (e.g. <LiveReload/>) emit prod
    // output. Users can still override with `NODE_ENV=staging bractjs start`.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    const { createServer } = await import("../src/server/serve.ts");
    createServer({ port: 3000, buildDir: "./build" });
    break;
  }

  case "codegen": {
    const { writeRouteTypes } = await import("../src/codegen/route-codegen.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    const outPath = process.argv[4] ? resolve(process.cwd(), process.argv[4]) : undefined;
    await writeRouteTypes(appDir, outPath);
    break;
  }

  default:
    console.log(
      "Usage: bractjs <command>\n" +
        "  new      <app-name>    Scaffold a new BractJS app\n" +
        "  dev                    Start dev server with HMR\n" +
        "  build                  Build for production\n" +
        "  start                  Start production server\n" +
        "  codegen  [app] [out]   Generate typed route types",
    );
    process.exit(1);
}

