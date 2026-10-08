// Dev rebuild pipeline: serialized rebuilds, the chunk URL a route swap needs,
// and an atomically written manifest.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rebuildClient, serializeRebuilds } from "../dev/rebuilder.ts";

describe("serializeRebuilds", () => {
  test("runs batches one at a time, never concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const ran: number[][] = [];
    const schedule = serializeRebuilds<number[]>(
      async (batch) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Bun.sleep(20);
        ran.push(batch);
        active--;
      },
      (a, b) => [...a, ...b],
    );
    const first = schedule([1]);
    await Bun.sleep(5); // the first rebuild is now in flight
    // Three bursts arrive while the first rebuild is still running…
    schedule([2]);
    schedule([3]);
    const last = schedule([4]);
    await Promise.all([first, last]);
    expect(maxActive).toBe(1);
    // …and coalesce into exactly ONE follow-up run carrying all of them.
    expect(ran).toEqual([[1], [2, 3, 4]]);
  });

  test("a failing run is logged and later batches still run", async () => {
    const ran: string[] = [];
    const errors: unknown[] = [];
    const prev = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const schedule = serializeRebuilds<string>(
        async (b) => {
          if (b === "bad") throw new Error("rebuild exploded");
          ran.push(b);
        },
        (_a, b) => b,
      );
      await schedule("bad");
      await schedule("good");
    } finally {
      console.error = prev;
    }
    expect(ran).toEqual(["good"]);
    expect(errors.length).toBe(1);
  });
});

// rebuildClient resolves everything against process.cwd() (the shim, outdir,
// appDir), so it runs from inside a throwaway app under this directory — the
// app's React import resolves to the framework's own devDependency.
const TMP = resolve(import.meta.dir, `.tmp-dev-rebuild-${Date.now()}`);
const originalCwd = process.cwd();

describe("rebuildClient", () => {
  beforeAll(() => {
    mkdirSync(join(TMP, "app", "routes", "blog"), { recursive: true });
    writeFileSync(
      join(TMP, "app", "root.tsx"),
      `export default function Root() { return <html><body>root</body></html>; }\n`,
    );
    writeFileSync(
      join(TMP, "app", "routes", "_index.tsx"),
      `export default function I() { return <p>i</p>; }\n`,
    );
    writeFileSync(
      join(TMP, "app", "routes", "blog", "[id].tsx"),
      `export default function Post() { return <p>post</p>; }\n`,
    );
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(TMP, { recursive: true, force: true });
  });

  test("returns the chunk URL the route was really written to, and an atomically written manifest", async () => {
    process.chdir(TMP);
    let result: Awaited<ReturnType<typeof rebuildClient>>;
    try {
      result = await rebuildClient({ appDir: "./app", buildDir: "build" });
    } finally {
      process.chdir(originalCwd);
    }
    const chunk = result.routeChunks.get("blog/[id]");
    // Dev outputs mirror the source tree; the old HMR message pointed at
    // /build/client/[id].js (the basename), which 404'd and forced a reload.
    expect(chunk).toBe("/build/client/app/routes/blog/[id].js");
    expect(existsSync(join(TMP, chunk!.slice(1)))).toBe(true);

    const buildFiles = readdirSync(join(TMP, "build"));
    expect(buildFiles).toContain("route-manifest.json");
    expect(buildFiles.filter((f) => f.endsWith(".tmp"))).toEqual([]);
    const manifest = (await Bun.file(join(TMP, "build", "route-manifest.json")).json()) as {
      routes: Record<string, { chunk: string }>;
    };
    expect(manifest.routes["blog/[id]"].chunk).toBe(chunk!);
  });
});
