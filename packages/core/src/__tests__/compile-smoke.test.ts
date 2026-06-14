/**
 * End-to-end guardrail for the `bun build --compile` single-executable feature.
 *
 * This test runs the REAL single-binary pipeline against a minimal app and
 * boots the produced executable:
 *
 *   writeModuleRegistries()  → app/_generated/{routes,actions}.ts (static imports)
 *   runBuild()               → build/client/* + route-manifest.json
 *   writeManifestModule()    → app/_generated/manifest.ts (inline constant)
 *   bun build --compile      → a self-contained binary (no runtime fs scans)
 *
 * It then launches the binary and asserts the SSR response is correct —
 * crucially that the route's `meta()` <title>/<meta> tags render into the HTML
 * (the recently-added SSR meta path) and that `__BRACTJS_DATA__` is present.
 * This converts "we believe it still compiles" into "CI proves the binary
 * boots and serves correct HTML."
 *
 * It mirrors the CLI's `compile` command (bin/cli.ts) but drives the exported
 * programmatic functions directly so it stays in-process and fast to author.
 *
 * The whole suite is skipped gracefully if `bun build --compile` isn't usable
 * in the current environment (it is intentionally heavyweight).
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  writeModuleRegistries,
  writeManifestModule,
} from "../codegen/module-registry.ts";
import { runBuild } from "../build/bundler.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");
// Inside the repo tree so the app's `@bractjs/bractjs` import resolves to the
// in-repo framework (the package self-resolves its own name). `.tmp-*` is
// gitignored, so the working tree stays clean even if a run aborts.
const TMP = resolve(import.meta.dir, `.tmp-compile-${Date.now()}`);
const APP = join(TMP, "app");
const BIN = join(TMP, "bin", "app");
const PORT = 3987;

let compileAvailable = false;
let serverProc: Bun.Subprocess | null = null;
const originalCwd = process.cwd();

// Probe once: can we run `bun build --compile` at all here?
async function probeCompile(): Promise<boolean> {
  const dir = join(TMP, ".probe");
  await mkdir(dir, { recursive: true });
  const entry = join(dir, "entry.ts");
  const out = join(dir, "out");
  await writeFile(entry, `console.log("ok");\n`);
  try {
    const proc = Bun.spawn(["bun", "build", "--compile", entry, "--outfile", out], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function scaffoldApp(): Promise<void> {
  await mkdir(join(APP, "routes"), { recursive: true });
  await mkdir(join(TMP, "bin"), { recursive: true });

  await writeFile(
    join(APP, "root.tsx"),
    `import { Outlet, Scripts } from "@bractjs/bractjs";
export default function Root() {
  return (
    <html lang="en">
      <head><meta charSet="utf-8" /></head>
      <body><Outlet /><Scripts /></body>
    </html>
  );
}
`,
  );

  await writeFile(
    join(APP, "routes", "_index.tsx"),
    `import type { LoaderArgs } from "@bractjs/bractjs";
export function loader(_args: LoaderArgs) {
  return { greeting: "compiled-hello" };
}
export function meta() {
  return [
    { title: "Compiled Title" },
    { name: "description", content: "Compiled description" },
  ];
}
export default function Index() {
  return <main>index</main>;
}
`,
  );

  await writeFile(
    join(APP, "server.ts"),
    `import { createServer } from "@bractjs/bractjs";
import { routeFiles, moduleRegistry } from "./_generated/routes.ts";
import { actionModules } from "./_generated/actions.ts";
import { manifest } from "./_generated/manifest.ts";

createServer({
  port: Number(process.env.PORT ?? ${PORT}),
  appDir: "./app",
  publicDir: "./public",
  manifest,
  routeFiles,
  moduleRegistry,
  actionModules,
});
`,
  );

  // tsconfig so --compile-autoload-tsconfig picks up the JSX runtime, mirroring
  // the scaffold template.
  await writeFile(
    join(TMP, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          jsx: "react-jsx",
          jsxImportSource: "react",
          strict: true,
          allowImportingTsExtensions: true,
          noEmit: true,
          skipLibCheck: true,
        },
      },
      null,
      2,
    ),
  );

  await mkdir(join(TMP, "public"), { recursive: true });
}

// `stdout`/`stderr` are typed as `number | ReadableStream` on a Bun
// Subprocess (the number branch is for inherited/ignored fds). Only read when
// it's an actual stream.
async function readStream(s: number | ReadableStream<Uint8Array> | undefined | null): Promise<string> {
  if (!s || typeof s === "number") return "";
  return new Response(s).text();
}

async function waitForServer(url: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      // not up yet
    }
    await Bun.sleep(150);
  }
  return false;
}

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  compileAvailable = await probeCompile();
  if (!compileAvailable) {
    console.warn("[compile-smoke] `bun build --compile` unavailable — skipping e2e binary test.");
    return;
  }

  await scaffoldApp();

  // Run the pipeline from inside the app dir (runBuild + manifest use cwd-relative
  // `build/` paths, matching how the CLI runs).
  process.chdir(TMP);
  try {
    // A) static registries for routes + actions
    await writeModuleRegistries(resolve(TMP, "app"));
    // B) client + server bundle (writes build/client + route-manifest.json)
    await runBuild({ appDir: "./app", buildDir: "./build" });
    // C) snapshot manifest → app/_generated/manifest.ts
    await writeManifestModule(resolve(TMP, "app"), resolve(TMP, "build"));

    // D) bun build --compile (mirror bin/cli.ts: dev NODE_ENV avoids the React
    // TSX jsxDEV miscompile; --compile-autoload-tsconfig keeps JSX settings).
    const compile = Bun.spawn(
      [
        "bun",
        "build",
        "--compile",
        "--compile-autoload-tsconfig",
        "app/server.ts",
        "--outfile",
        BIN,
      ],
      {
        cwd: TMP,
        env: { ...process.env, NODE_ENV: "development" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const code = await compile.exited;
    if (code !== 0) {
      const err = await readStream(compile.stderr);
      throw new Error(`bun build --compile failed (${code}):\n${err}`);
    }

    // Boot the binary (NODE_ENV=production so dev gates stay off — the real
    // single-binary deployment mode).
    serverProc = Bun.spawn([BIN], {
      cwd: TMP,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdout: "ignore",
      stderr: "pipe",
    });
    const up = await waitForServer(`http://localhost:${PORT}/`);
    if (!up) {
      const err = await readStream(serverProc.stderr);
      throw new Error(`compiled binary did not start listening:\n${err}`);
    }
  } finally {
    process.chdir(originalCwd);
  }
}, 120_000);

afterAll(async () => {
  try { serverProc?.kill(); } catch { /* already dead */ }
  process.chdir(originalCwd);
  await rm(TMP, { recursive: true, force: true });
});

describe("bun build --compile single-binary", () => {
  test("compiled binary serves SSR HTML with 200", async () => {
    if (!compileAvailable) return;
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("compiled binary renders meta() <title> and <meta> into the SSR head", async () => {
    if (!compileAvailable) return;
    const res = await fetch(`http://localhost:${PORT}/`);
    const html = await res.text();
    // Strip the data island so we assert on the rendered document, not the
    // __BRACTJS_DATA__ JSON (which also carries the meta text).
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(withoutScripts).toMatch(/<title>Compiled Title<\/title>/);
    expect(withoutScripts).toMatch(/<meta[^>]+name="description"[^>]+content="Compiled description"/);
  });

  test("compiled binary embeds loader data + bootstrap island", async () => {
    if (!compileAvailable) return;
    const res = await fetch(`http://localhost:${PORT}/`);
    const html = await res.text();
    expect(html).toContain("__BRACTJS_DATA__");
    expect(html).toContain("compiled-hello");
  });

  test("compiled binary did not fall back to a runtime fs scan (registry mode)", async () => {
    if (!compileAvailable) return;
    // A 404 for an unmapped path proves routing came from the embedded trie,
    // not a crash from a missing appDir scan.
    const res = await fetch(`http://localhost:${PORT}/definitely-not-a-route`);
    expect(res.status).toBe(404);
  });
});

// Keep REPO_ROOT referenced (documents where framework resolution comes from).
void REPO_ROOT;
