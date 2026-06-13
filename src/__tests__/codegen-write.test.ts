import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeRouteTypes,
  explainStalenessForApp,
} from "../codegen/route-codegen.ts";

let appDir = "";

beforeEach(async () => {
  appDir = join(tmpdir(), `bract-codegen-write-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(appDir, "routes"), { recursive: true });
  await writeFile(join(appDir, "routes", "_index.tsx"), "export default () => null;");
});

afterEach(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe("writeRouteTypes — idempotency", () => {
  test("writes on first run, skips identical re-run, rewrites on route change", async () => {
    const first = await writeRouteTypes(appDir);
    expect(first.written).toBe(true);

    const destStat = await stat(first.dest);
    const mtime1 = destStat.mtimeMs;

    // Identical re-run: no write (so no file-watcher event / editor reload loop).
    const second = await writeRouteTypes(appDir);
    expect(second.written).toBe(false);
    expect((await stat(first.dest)).mtimeMs).toBe(mtime1);

    // Add a route → content changes → write happens.
    await writeFile(join(appDir, "routes", "about.tsx"), "export default () => null;");
    const third = await writeRouteTypes(appDir);
    expect(third.written).toBe(true);
  });
});

describe("explainStalenessForApp", () => {
  test("missing generated file → reason mentions missing", async () => {
    const reason = await explainStalenessForApp(appDir);
    expect(reason).toMatch(/missing/);
  });

  test("fresh after codegen → null", async () => {
    await writeRouteTypes(appDir);
    expect(await explainStalenessForApp(appDir)).toBeNull();
  });

  test("added route → reports +1", async () => {
    await writeRouteTypes(appDir);
    await writeFile(join(appDir, "routes", "about.tsx"), "export default () => null;");
    const reason = await explainStalenessForApp(appDir);
    expect(reason).toMatch(/\+1 added/);
  });

  test("removed route → reports -1", async () => {
    await writeFile(join(appDir, "routes", "about.tsx"), "export default () => null;");
    await writeRouteTypes(appDir);
    await rm(join(appDir, "routes", "about.tsx"));
    const reason = await explainStalenessForApp(appDir);
    expect(reason).toMatch(/-1 removed/);
  });
});
