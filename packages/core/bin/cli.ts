#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fillTemplate, type TemplateVars } from "./scaffold-template.ts";

const command = process.argv[2];

const USAGE =
  "Usage: bractjs <command> [options]\n\n" +
  "  new      <app-name> [--tailwind]     Scaffold a new BractJS app\n" +
  "  dev      [--port n] [--host [addr]]  Dev server with HMR (loopback unless --host)\n" +
  "  build                                Build for production (build/ dir)\n" +
  "  start    [--port n] [--host addr]    Start the production server\n" +
  "  codegen  [app] [out]                 Generate typed route types\n" +
  "  codegen:seed  [app]                  Seed _generated/ so app/server.ts typechecks (no build needed)\n" +
  "  codegen:registry  [app]              Generate _generated/{routes,actions}.ts\n" +
  "  codegen:manifest  [app] [build]      Generate _generated/manifest.ts\n" +
  "  compile  [outfile] [entry]           Full single-binary pipeline\n\n" +
  "  -v, --version                        Print the BractJS version\n" +
  "  -h, --help                           Print this help\n\n" +
  "Ports: --port wins, then the PORT environment variable, then `port` in bractjs.config.ts, then 3000.";

const COMMANDS = [
  "new",
  "dev",
  "build",
  "start",
  "codegen",
  "codegen:seed",
  "codegen:registry",
  "codegen:manifest",
  "compile",
];

/** Value of `--name value` or `--name=value`; `""` for a bare `--name`; undefined when absent. */
function flag(name: string): string | undefined {
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}`) {
      const next = args[i + 1];
      return next !== undefined && !next.startsWith("-") ? next : "";
    }
    if (args[i].startsWith(`--${name}=`)) return args[i].slice(name.length + 3);
  }
  return undefined;
}

/** `--port` as a validated number (exits with the error on a bad value). */
async function portFlag(): Promise<number | undefined> {
  const { parsePort } = await import("../src/server/env.ts");
  try {
    return parsePort(flag("port"), "--port");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

/** Closest known command by edit distance, for "did you mean" (≤ 3 edits). */
function closestCommand(input: string): string | undefined {
  const distance = (a: string, b: string): number => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
    return d[a.length][b.length];
  };
  let best: { cmd: string; d: number } | undefined;
  for (const cmd of COMMANDS) {
    const d = distance(input, cmd);
    if (!best || d < best.d) best = { cmd, d };
  }
  return best && best.d <= 3 ? best.cmd : undefined;
}

// ── new <app-name> ──────────────────────────────────────────────────────────

const TAILWIND_DEV_DEPS = { "bun-plugin-tailwind": "^0.1.2", tailwindcss: "^4.3.3" };

async function scaffoldNew(): Promise<void> {
  const args = process.argv.slice(3);
  const appName = args.find((a) => !a.startsWith("-"));
  const tailwind = args.includes("--tailwind");
  const install = !args.includes("--no-install");
  if (!appName) {
    console.error("Usage: bractjs new <app-name> [--tailwind] [--no-install]");
    process.exit(1);
  }
  // It becomes the package name and the directory name.
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(appName) || appName.length > 214) {
    console.error(
      `"${appName}" isn't a valid app name: use lowercase letters, digits, "-", "_" and "." (it becomes the package name).`,
    );
    process.exit(1);
  }

  const appDir = resolve(process.cwd(), appName);
  if (existsSync(appDir)) {
    console.error(`Directory "${appName}" already exists.`);
    process.exit(1);
  }

  const templatesDir = join(import.meta.dirname, "../templates");
  const pkg = (await Bun.file(join(import.meta.dirname, "../package.json")).json()) as { version: string };
  const vars = { APP_NAME: appName, BRACTJS_VERSION: pkg.version };
  console.log(`Creating ${appName}${tailwind ? " (Tailwind)" : ""}...`);

  await copyDir(join(templatesDir, "new-app"), appDir, vars);
  if (tailwind) {
    // The overlay replaces styles.css + bractjs.config.ts; the plugin and
    // Tailwind itself become devDependencies.
    await copyDir(join(templatesDir, "new-app-tailwind"), appDir, vars, ["OVERLAY.md"]);
    const pkgPath = join(appDir, "package.json");
    const appPkg = (await Bun.file(pkgPath).json()) as { devDependencies: Record<string, string> };
    appPkg.devDependencies = Object.fromEntries(
      Object.entries({ ...appPkg.devDependencies, ...TAILWIND_DEV_DEPS }).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
    await Bun.write(pkgPath, JSON.stringify(appPkg, null, 2) + "\n");
  }

  if (install) {
    console.log("Installing dependencies...");
    const result = Bun.spawnSync(["bun", "install"], {
      cwd: appDir,
      stdio: ["inherit", "inherit", "inherit"],
    });
    if (result.exitCode !== 0) {
      console.error("bun install failed.");
      process.exit(result.exitCode ?? 1);
    }
  }

  // Seed `app/_generated/` so the template's `app/server.ts` typechecks
  // before the user runs a build (route/action registries, typed routes, and
  // a manifest stub). Shared with the `codegen:seed` command.
  console.log("Seeding _generated/ registries...");
  try {
    const { seedGenerated } = await import("../src/codegen/seed.ts");
    await seedGenerated(join(appDir, "app"));
  } catch (err) {
    console.warn("[bract] codegen seed skipped:", err instanceof Error ? err.message : err);
  }

  console.log(`\n✓ Created ${appName}\n`);
  console.log("Next steps:");
  console.log(`  cd ${appName}`);
  if (!install) console.log("  bun install");
  console.log("  bun run dev");
}

/**
 * Copy a template directory, filling `{{PLACEHOLDERS}}`. Files named
 * `gitignore` become `.gitignore`: npm never publishes a file called
 * `.gitignore`, so the template can't ship one under that name.
 */
async function copyDir(src: string, dest: string, vars: TemplateVars, skip: string[] = []): Promise<void> {
  const glob = new Bun.Glob("**/*");
  for await (const rel of glob.scan({ cwd: src, onlyFiles: true, dot: true })) {
    if (skip.includes(rel)) continue;
    const destRel = rel.split("/").at(-1) === "gitignore" ? rel.replace(/gitignore$/, ".gitignore") : rel;
    const destPath = join(dest, destRel);
    await Bun.write(destPath, fillTemplate(await Bun.file(join(src, rel)).text(), vars));
  }
}

// ── dispatch ────────────────────────────────────────────────────────────────

switch (command) {
  case "-v":
  case "--version": {
    const pkg = (await Bun.file(join(import.meta.dirname, "../package.json")).json()) as { version: string };
    console.log(pkg.version);
    break;
  }

  case undefined:
  case "-h":
  case "--help":
  case "help":
    console.log(USAGE);
    break;

  case "new":
    await scaffoldNew();
    break;

  case "dev": {
    // Ensure dev-only handlers gated by isExplicitDev() (e.g. /_hmr/module,
    // /_bractjs/devtools.js) are reachable when the user hasn't set NODE_ENV.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

    // `--host [addr]` exposes the dev server beyond loopback (bare `--host` =
    // all interfaces). Carried to the respawned child through the env.
    const hostIdx = process.argv.indexOf("--host");
    if (hostIdx !== -1) {
      const next = process.argv[hostIdx + 1];
      process.env.BRACTJS_DEV_HOST = next && !next.startsWith("-") ? next : "0.0.0.0";
    }
    // `--port n` → PORT for the child (createDevServer reads it after the
    // option and before the config file).
    const devPort = await portFlag();
    if (devPort !== undefined) process.env.PORT = String(devPort);

    // Reserved child exit code meaning "a server module changed — respawn me".
    // 75 = EX_TEMPFAIL, chosen to never collide with real failure codes.
    const DEV_RESTART_EXIT_CODE = 75;

    if (process.env.BRACTJS_DEV_CHILD === "1") {
      // Child mode: actually run the dev server. On a change the process
      // cannot absorb (server.ts / lifecycle.ts / *.server.ts / shared
      // modules / added or removed routes), exit with the reserved code so
      // the supervisor below respawns us; the browser reloads itself when
      // its HMR socket reconnects.
      const { createDevServer, DevServerError } = await import("../src/dev/server.ts");
      try {
        await createDevServer({
          hostname: process.env.BRACTJS_DEV_HOST || undefined,
          onRestartRequired: (file) => {
            console.log(`[bractjs] ${file} changed — restarting dev server…`);
            process.exit(DEV_RESTART_EXIT_CODE);
          },
        });
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

    // Supervisor mode: run the dev server as a child process and respawn it
    // whenever it exits with the reserved restart code. Any other exit
    // (Ctrl+C, port conflict, crash) is propagated and ends the loop.
    for (;;) {
      const child = Bun.spawn([process.execPath, import.meta.path, "dev"], {
        env: { ...process.env, BRACTJS_DEV_CHILD: "1" },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = await child.exited;
      if (code !== DEV_RESTART_EXIT_CODE) process.exit(code ?? 0);
    }
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
    const { loadLifecycleModule, loadServerEntry } = await import("../src/config/server-entry.ts");
    // The config carries runtime-relevant fields too (ssr, port, dirs).
    const userCfg = await loadUserConfig();
    const appDir = userCfg.appDir ?? "./app";
    // Parity with `bractjs dev` and the compiled binary: pick up lifecycle
    // hooks and app/server.ts's pipeline.use(...) registrations (its own
    // createServer() call is suppressed during the import).
    const lifecycle = await loadLifecycleModule(appDir);
    const entry = await loadServerEntry(appDir);
    if (entry.error) {
      console.warn(
        "[bractjs] app/server.ts failed to load — global middleware registered there is INACTIVE:",
        entry.error instanceof Error ? entry.error.message : entry.error,
      );
    }
    // --port > PORT > config `port` > 3000; --host > HOST > config `hostname` >
    // all interfaces. Hosting platforms (Fly, Render, Railway) set PORT.
    const { envPort, parsePort } = await import("../src/server/env.ts");
    let port: number;
    try {
      port = (await portFlag()) ?? envPort() ?? parsePort(userCfg.port, "bractjs.config.ts") ?? 3000;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    const hostname = flag("host") || process.env.HOST || userCfg.hostname;
    createServer({ buildDir: "./build", ...userCfg, ...lifecycle, port, hostname });
    break;
  }

  case "codegen": {
    const { writeRouteTypes } = await import("../src/codegen/route-codegen.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    const outPath = process.argv[4] ? resolve(process.cwd(), process.argv[4]) : undefined;
    await writeRouteTypes(appDir, outPath);
    break;
  }

  case "codegen:seed": {
    // Seed `<appDir>/_generated/` (registries + typed routes + manifest stub)
    // so `app/server.ts` typechecks without a prior build. The generated
    // files are gitignored; run this after a fresh clone (it's the examples'
    // `pretypecheck`). Same seeding `bractjs new` does.
    const { seedGenerated } = await import("../src/codegen/seed.ts");
    const appDir = resolve(process.cwd(), process.argv[3] ?? "./app");
    await seedGenerated(appDir);
    console.log("[bract] seeded", join(appDir, "_generated"));
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

    // Honor `appDir` / `buildDir` from bractjs.config.ts like build and start do.
    const userCfg = await loadUserConfig();
    const appDirRel = userCfg.appDir ?? "./app";
    const buildDirRel = userCfg.buildDir ?? "./build";
    const appDir = resolve(process.cwd(), appDirRel);
    const buildDir = resolve(process.cwd(), buildDirRel);
    const outFile = process.argv[3] ?? "./bractjs-app";
    const entryPath = process.argv[4] ?? join(appDirRel, "server.ts");

    console.log("[bract] (1/4) registry codegen…");
    await writeModuleRegistries(appDir);

    console.log("[bract] (2/4) client + server build…");
    await runBuild({ ...userCfg, appDir: appDirRel, buildDir: buildDirRel });

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

  default: {
    const guess = closestCommand(command);
    console.error(`Unknown command "${command}".${guess ? ` Did you mean "${guess}"?` : ""}\n`);
    console.error(USAGE);
    process.exit(1);
  }
}
