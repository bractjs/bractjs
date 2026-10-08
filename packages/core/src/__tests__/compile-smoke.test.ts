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
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
// Inside the repo tree so the app's `@bractjs/bractjs` import resolves to the
// in-repo framework (the package self-resolves its own name). `.tmp-*` is
// gitignored, so the working tree stays clean even if a run aborts.
const TMP = resolve(import.meta.dir, `.tmp-compile-${Date.now()}`);
const APP = join(TMP, "app");
const BIN = join(TMP, "bin", "app");
const ELSEWHERE = join(TMP, "elsewhere");
const CLI = join(REPO_ROOT, "bin", "cli.ts");
const PORT = 3987;

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

// Probed at module load so the suite can skipIf() — a silent `return` inside
// each test would report "pass" while asserting nothing. In CI, set
// CI_REQUIRE_COMPILE=1 to turn "compile unavailable" into a hard failure
// instead of a skip.
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });
const compileAvailable = await probeCompile();
if (!compileAvailable) {
  if (process.env.CI_REQUIRE_COMPILE) {
    throw new Error(
      "[compile-smoke] `bun build --compile` unavailable, but CI_REQUIRE_COMPILE is set — failing instead of skipping.",
    );
  }
  console.warn("[compile-smoke] `bun build --compile` unavailable — skipping e2e binary test.");
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
import styles from "./index.module.css";
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
  return <main className={styles.card}>index</main>;
}
`,
  );
  await writeFile(join(APP, "routes", "index.module.css"), ".card { color: rebeccapurple; }\n");
  // Bun inlines process.env.NODE_ENV at bundle time: this loader reports what
  // the compiled code actually sees, and a throwing one proves the redaction
  // gate (isExplicitDev) is off in the binary.
  await writeFile(
    join(APP, "routes", "mode.tsx"),
    `export function loader() { return { mode: process.env.NODE_ENV ?? "unset" }; }\n` +
      `export default function Mode() { return <p>mode</p>; }\n`,
  );
  await writeFile(
    join(APP, "routes", "boom.tsx"),
    `export function loader() { throw new Error("secret-internal-detail"); }\n` +
      `export default function Boom() { return <p>boom</p>; }\n`,
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
  await writeFile(join(TMP, "public", "robots.txt"), "User-agent: *\nAllow: /\n");
  // Prerendered at compile time; its loader stamp proves the page came from
  // the embedded _prerender output rather than a fresh render.
  await writeFile(
    join(APP, "routes", "static-page.tsx"),
    `export function loader() { return { stamp: "prerendered-" + Date.now() }; }\n` +
      `import { useLoaderData } from "@bractjs/bractjs";\n` +
      `export default function StaticPage() {\n` +
      `  const { stamp } = useLoaderData<typeof loader>();\n` +
      `  return <p id="stamp">{stamp}</p>;\n` +
      `}\n`,
  );
  await writeFile(join(TMP, "bractjs.config.ts"), `export default { prerender: ["/static-page"] };\n`);
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
  if (!compileAvailable) return;

  await scaffoldApp();

  // Run the pipeline from inside the app dir (runBuild + manifest use cwd-relative
  // `build/` paths, matching how the CLI runs).
  process.chdir(TMP);
  try {
    // The real pipeline, through the CLI: registries → client build →
    // prerender (bractjs.config.ts) → manifest → bun build --compile with
    // build/client and public/ embedded.
    const compile = Bun.spawn(["bun", CLI, "compile", BIN, "app/server.ts"], {
      cwd: TMP,
      env: { ...process.env, NODE_ENV: "production" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await compile.exited;
    if (code !== 0) {
      const err = (await readStream(compile.stdout)) + (await readStream(compile.stderr));
      throw new Error(`bractjs compile failed (${code}):\n${err}`);
    }

    // Boot the binary from an EMPTY directory (NODE_ENV=production so dev
    // gates stay off): no build/, no public/, no app/ — everything it serves
    // must come from inside the executable.
    await mkdir(ELSEWHERE, { recursive: true });
    serverProc = Bun.spawn([BIN], {
      cwd: ELSEWHERE,
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
  try {
    serverProc?.kill();
  } catch {
    /* already dead */
  }
  process.chdir(originalCwd);
  await rm(TMP, { recursive: true, force: true });
});

describe.skipIf(!compileAvailable)("bun build --compile single-binary", () => {
  test("serves its client build and public files from inside the executable", async () => {
    const html = await (await fetch(`http://localhost:${PORT}/`)).text();
    const js = html.match(/src="(\/build\/client\/[^"]+\.js)"/)?.[1];
    expect(js).toBeDefined();
    const jsRes = await fetch(`http://localhost:${PORT}${js}`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get("content-type")).toContain("javascript");
    const css = html.match(/href="(\/build\/client\/[^"]+\.css)"/)?.[1];
    expect(css).toBeDefined();
    expect((await fetch(`http://localhost:${PORT}${css}`)).status).toBe(200);
    const robots = await fetch(`http://localhost:${PORT}/public/robots.txt`);
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("User-agent");
  });

  test("serves prerendered pages from inside the executable", async () => {
    const first = await (await fetch(`http://localhost:${PORT}/static-page`)).text();
    const stamp = first.match(/<p id="stamp">(prerendered-\d+)<\/p>/)?.[1];
    expect(stamp).toBeDefined();
    // The same stamp again: a file, not a fresh render (which would re-stamp).
    await Bun.sleep(5);
    expect(await (await fetch(`http://localhost:${PORT}/static-page`)).text()).toContain(stamp!);
  });

  test("CSS Module class names match the client bundle's", async () => {
    const html = await (await fetch(`http://localhost:${PORT}/`)).text();
    const cls = html.match(/<main class="([^"]+)">index<\/main>/)?.[1];
    expect(cls).toMatch(/^card_/);
    // The same scoped name appears in the client JS the browser hydrates with.
    const glob = new Bun.Glob("**/*.js");
    let inClient = false;
    for await (const f of glob.scan(join(TMP, "build", "client"))) {
      if ((await Bun.file(join(TMP, "build", "client", f)).text()).includes(cls!)) inClient = true;
    }
    expect(inClient).toBe(true);
  });

  test("compiled binary serves SSR HTML with 200", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("compiled binary renders meta() <title> and <meta> into the SSR head", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    const html = await res.text();
    // Strip the data island so we assert on the rendered document, not the
    // __BRACTJS_DATA__ JSON (which also carries the meta text).
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(withoutScripts).toMatch(/<title>Compiled Title<\/title>/);
    expect(withoutScripts).toMatch(/<meta[^>]+name="description"[^>]+content="Compiled description"/);
  });

  test("compiled binary embeds loader data + bootstrap island", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    const html = await res.text();
    expect(html).toContain("__BRACTJS_DATA__");
    expect(html).toContain("compiled-hello");
  });

  test("compiled binary runs in production mode regardless of the compile env", async () => {
    // Regression: `bractjs compile` forced NODE_ENV=development into the
    // `bun build --compile` env and Bun baked that literal into the binary, so
    // every NODE_ENV-gated production guard was off in deployed executables.
    const data = (await (await fetch(`http://localhost:${PORT}/_data?path=/mode`)).json()) as {
      route: { mode: string };
    };
    expect(data.route.mode).toBe("production");
    // Loader errors must be redacted (isExplicitDev() false), not echoed.
    const boom = await (await fetch(`http://localhost:${PORT}/boom`)).text();
    expect(boom).not.toContain("secret-internal-detail");
  });

  test("compiled binary did not fall back to a runtime fs scan (registry mode)", async () => {
    // A 404 for an unmapped path proves routing came from the embedded trie,
    // not a crash from a missing appDir scan.
    const res = await fetch(`http://localhost:${PORT}/definitely-not-a-route`);
    expect(res.status).toBe(404);
  });
});

// Keep REPO_ROOT referenced (documents where framework resolution comes from).
void REPO_ROOT;
