import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadLifecycleModule, loadServerEntry } from "../config/server-entry.ts";
import type { MiddlewareContext } from "../server/middleware.ts";
import { pipeline } from "../server/middleware.ts";
import { createServer } from "../server/serve.ts";

const SRC_INDEX = resolve(import.meta.dir, "../index.ts");
// High, unlikely-to-collide port. Nothing should EVER listen on it — the
// entry's createServer() call must be suppressed during loadServerEntry.
const CANARY_PORT = 39831;

let tmp: string;

declare global {
  var __entryTestEvals: number | undefined;
}

beforeAll(async () => {
  pipeline.clear();
  tmp = mkdtempSync(join(tmpdir(), "bract-entry-"));
  await Bun.write(
    join(tmp, "app", "routes", "index.tsx"),
    "export default function Index() { return null; }\n",
  );
  await Bun.write(
    join(tmp, "app", "server.ts"),
    [
      `import { createServer, pipeline } from ${JSON.stringify(SRC_INDEX)};`,
      "globalThis.__entryTestEvals = (globalThis.__entryTestEvals ?? 0) + 1;",
      "pipeline.use(async (_ctx, next) => {",
      "  const res = await next();",
      '  res.headers.set("X-Entry-Test", "1");',
      "  return res;",
      "});",
      `createServer({ port: ${CANARY_PORT}, appDir: "./app" });`,
      "",
    ].join("\n"),
  );
  await Bun.write(
    join(tmp, "app", "lifecycle.ts"),
    "export default { onStart() { globalThis.__entryTestOnStart = true; } };\n",
  );
});

afterAll(() => {
  pipeline.clear();
  rmSync(tmp, { recursive: true, force: true });
});

describe("loadServerEntry", () => {
  test("imports app/server.ts side effects without starting its server", async () => {
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      const result = await loadServerEntry("./app");
      expect(result.loaded).toBe(true);
      expect(result.error).toBeUndefined();
    } finally {
      process.chdir(prevCwd);
    }

    expect(globalThis.__entryTestEvals).toBe(1);

    // pipeline.use() from the entry took effect…
    const ctx: MiddlewareContext = { request: new Request("http://x/"), params: {}, context: {} };
    const res = await pipeline.run(ctx, () => Promise.resolve(new Response("ok")));
    expect(res.headers.get("X-Entry-Test")).toBe("1");

    // …but its createServer() call bound nothing.
    await expect(fetch(`http://localhost:${CANARY_PORT}/`)).rejects.toThrow();
  });

  test("is idempotent per process (module cache: side effects run once)", async () => {
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      const result = await loadServerEntry("./app");
      expect(result.loaded).toBe(true);
    } finally {
      process.chdir(prevCwd);
    }
    expect(globalThis.__entryTestEvals).toBe(1);
  });

  test("suppression is reset afterwards: createServer works again", () => {
    const listened: number[] = [];
    const fakeAdapter = {
      fetch: () => Promise.resolve(new Response("ok")),
      listen: (port: number) => {
        listened.push(port);
      },
    };
    // Registry-mode config keeps this hermetic: no fs scans, no manifest read.
    const handle = createServer({
      port: 39832,
      adapter: fakeAdapter,
      manifest: { clientEntry: "/build/client/client.js", routes: {} },
      routeFiles: [],
      moduleRegistry: {},
      actionModules: [],
    });
    expect(listened).toEqual([39832]);
    handle.stop();
  });

  test("missing server.ts is not an error", async () => {
    const empty = mkdtempSync(join(tmpdir(), "bract-noentry-"));
    try {
      const prevCwd = process.cwd();
      process.chdir(empty);
      try {
        const result = await loadServerEntry("./app");
        expect(result).toEqual({ loaded: false });
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("loadLifecycleModule", () => {
  test("loads the default export", async () => {
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      const hooks = await loadLifecycleModule("./app");
      expect(typeof hooks.onStart).toBe("function");
    } finally {
      process.chdir(prevCwd);
    }
  });

  test("missing lifecycle.ts yields empty hooks", async () => {
    const empty = mkdtempSync(join(tmpdir(), "bract-nolife-"));
    try {
      const prevCwd = process.cwd();
      process.chdir(empty);
      try {
        expect(await loadLifecycleModule("./app")).toEqual({});
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
