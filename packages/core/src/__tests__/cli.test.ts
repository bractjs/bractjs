// The bractjs CLI: help/version/unknown-command handling, and which port
// `bractjs start` binds (--port > PORT > config > 3000).
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { envPort, parsePort } from "../server/env.ts";

const CLI = resolve(import.meta.dir, "../../bin/cli.ts");
const FIXTURES = join(import.meta.dir, "fixtures");

async function cli(args: string[], env: Record<string, string> = {}, cwd = FIXTURES) {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("bractjs CLI", () => {
  test("--version prints the package version", async () => {
    const pkg = (await Bun.file(resolve(import.meta.dir, "../../package.json")).json()) as {
      version: string;
    };
    const { stdout, code } = await cli(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  test("--help and no command print usage and exit 0", async () => {
    for (const args of [["--help"], ["-h"], []]) {
      const { stdout, code } = await cli(args);
      expect(code).toBe(0);
      expect(stdout).toContain("Usage: bractjs <command>");
    }
  });

  test("an unknown command fails with a suggestion", async () => {
    const { stderr, code } = await cli(["strat"]);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown command "strat". Did you mean "start"?');
  });

  test("start rejects an invalid PORT", async () => {
    const { stderr, code } = await cli(["start"], { PORT: "abc" });
    expect(code).toBe(1);
    expect(stderr).toContain("Invalid port from the PORT environment variable");
  });

  test("start binds PORT, and --port wins over it", async () => {
    const base = 4600 + Math.floor(Math.random() * 300);
    for (const [args, env, port] of [
      [["start"], { PORT: String(base) }, base],
      [["start", "--port", String(base + 1)], { PORT: String(base) }, base + 1],
    ] as const) {
      const proc = Bun.spawn(["bun", CLI, ...args], {
        cwd: FIXTURES,
        env: { ...process.env, ...env, NODE_ENV: "production" },
        stdout: "ignore",
        stderr: "ignore",
      });
      try {
        // Any HTTP answer proves the port is bound (the fixture has no build,
        // so the page itself may be an error).
        let answered = false;
        for (let i = 0; i < 60 && !answered; i++) {
          answered = await fetch(`http://localhost:${port}/`).then(
            () => true,
            () => false,
          );
          if (!answered) await Bun.sleep(100);
        }
        expect(answered).toBe(true);
      } finally {
        proc.kill();
        await proc.exited;
      }
    }
  }, 30_000);
});

describe("bractjs routes", () => {
  test("lists the fixture app's pages", async () => {
    const { stdout, code } = await cli(["routes"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/\[bractjs\] \d+ routes:/);
    expect(stdout).toContain("routes/_index.tsx");
  });

  test("--json prints the same inventory as data", async () => {
    const { stdout, code } = await cli(["routes", "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as { routes: Array<{ pattern: string; file: string }>; api: unknown[] };
    expect(parsed.routes.find((r) => r.file === "routes/_index.tsx")?.pattern).toBe("/");
    expect(Array.isArray(parsed.api)).toBe(true);
  });
});

describe("parsePort / envPort", () => {
  test("accept 1–65535, reject everything else", () => {
    expect(parsePort(undefined, "x")).toBeUndefined();
    expect(parsePort("", "x")).toBeUndefined();
    expect(parsePort("8080", "x")).toBe(8080);
    expect(parsePort(443, "x")).toBe(443);
    for (const bad of ["0", "65536", "80.5", "abc", -1]) {
      expect(() => parsePort(bad, "the test")).toThrow("Invalid port from the test");
    }
  });

  test("envPort reads PORT", () => {
    const saved = process.env.PORT;
    try {
      process.env.PORT = "5123";
      expect(envPort()).toBe(5123);
      delete process.env.PORT;
      expect(envPort()).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.PORT;
      else process.env.PORT = saved;
    }
  });
});
