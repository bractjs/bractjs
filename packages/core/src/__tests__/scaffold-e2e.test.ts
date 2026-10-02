// `bractjs new` end to end: scaffold (plain CSS and --tailwind), typecheck,
// build, start, request the home page and its stylesheet, and run the app's
// own sample test. The template is what every new user's first five minutes
// depend on — and it once shipped broken for three releases (0.3.x–0.4.0)
// because nothing booted a scaffolded app.
//
// Apps are scaffolded inside the repo (src/__tests__/.tmp-scaffold-*) with
// --no-install: react, Tailwind etc. resolve from the workspace's hoisted
// node_modules, and @bractjs/bractjs is linked to this package.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const CORE = resolve(import.meta.dir, "../..");
const CLI = join(CORE, "bin/cli.ts");
const TSC = join(CORE, "node_modules/.bin/tsc");
const roots: string[] = [];

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited ${code}\n${out}\n${err}`);
  return out;
}

async function scaffold(variant: "plain" | "tailwind"): Promise<string> {
  const root = join(import.meta.dir, `.tmp-scaffold-${variant}`);
  roots.push(root);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await run(
    ["bun", CLI, "new", "smoke-app", "--no-install", ...(variant === "tailwind" ? ["--tailwind"] : [])],
    root,
  );
  const appDir = join(root, "smoke-app");
  await mkdir(join(appDir, "node_modules/@bractjs"), { recursive: true });
  await symlink(CORE, join(appDir, "node_modules/@bractjs/bractjs"));
  return appDir;
}

async function boot(
  appDir: string,
  port: number,
): Promise<{ html: string; css: string; stop(): Promise<void> }> {
  const server = Bun.spawn(["bun", CLI, "start"], {
    cwd: appDir,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdout: "ignore",
    stderr: "pipe",
  });
  const stop = async () => {
    server.kill();
    await server.exited;
  };
  let res: Response | undefined;
  for (let i = 0; i < 100 && !res; i++) {
    res = await fetch(`http://localhost:${port}/`).catch(() => undefined);
    if (!res) await Bun.sleep(100);
  }
  if (!res) {
    await stop();
    throw new Error("the scaffolded app never answered");
  }
  const html = await res.text();
  const href = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
  const css = href ? await (await fetch(`http://localhost:${port}${href}`)).text() : "";
  return { html, css, stop };
}

describe.each(["plain", "tailwind"] as const)("bractjs new (%s)", (variant) => {
  test("scaffolds an app that typechecks, builds, serves styled pages and passes its own test", async () => {
    const appDir = await scaffold(variant);

    // Files the template must produce.
    for (const file of [".gitignore", "public/favicon.svg", "app/styles.css", "app/__tests__/home.test.ts"]) {
      expect(await Bun.file(join(appDir, file)).exists()).toBe(true);
    }
    const pkg = (await Bun.file(join(appDir, "package.json")).json()) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const core = (await Bun.file(join(CORE, "package.json")).json()) as { version: string };
    expect(pkg.dependencies["@bractjs/bractjs"]).toBe(`^${core.version}`);
    expect("tailwindcss" in pkg.devDependencies).toBe(variant === "tailwind");

    await run([TSC, "--noEmit"], appDir);
    await run(["bun", CLI, "build"], appDir, { NODE_ENV: "production" });

    const { html, css, stop } = await boot(appDir, 4900 + (variant === "plain" ? 1 : 2));
    try {
      expect(html).toContain("Hello from BractJS!");
      expect(html).toContain("<title>Home | smoke-app</title>");
      // One title: root's default is replaced by the route's, not duplicated.
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(css).toContain(".card");
      if (variant === "tailwind") expect(css).toContain("tailwindcss");
    } finally {
      await stop();
    }

    await run(["bun", "test", "app"], appDir);
  }, 120_000);
});

describe("bractjs new argument checks", () => {
  test("rejects an invalid app name", async () => {
    const proc = Bun.spawn(["bun", CLI, "new", "My App!", "--no-install"], {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain("isn't a valid app name");
  });
});
