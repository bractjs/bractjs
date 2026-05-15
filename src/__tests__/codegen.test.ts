import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateRouteTypes } from "../codegen/route-codegen.ts";

let appDir = "";

beforeAll(async () => {
  appDir = join(tmpdir(), `bract-codegen-${Date.now()}`);
  await mkdir(join(appDir, "routes"), { recursive: true });
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe("route-codegen — output shape", () => {
  test("emits JSON-quoted keys for safe patterns", async () => {
    const routesDir = join(appDir, "routes");
    await writeFile(join(routesDir, "_index.tsx"), "export default () => null;");
    await mkdir(join(routesDir, "users"), { recursive: true });
    await writeFile(join(routesDir, "users", "[id].tsx"), "export default () => null;");

    const out = await generateRouteTypes(appDir);
    expect(out).toContain("\"/\":");
    expect(out).toContain("\"/users/:id\":");
    // The pattern key in the literal union must also be JSON-quoted.
    expect(out).toMatch(/\| "\/users\/:id"/);
  });

  test("rejects hostile filenames at codegen time", async () => {
    const hostileApp = join(tmpdir(), `bract-codegen-hostile-${Date.now()}`);
    await mkdir(join(hostileApp, "routes"), { recursive: true });
    // Try to plant a filename with a quote. macOS/Linux accept it; if the FS
    // doesn't, we skip this assertion (FS already rejected the attack).
    const hostileFile = join(hostileApp, "routes", `bad"name.tsx`);
    let planted = false;
    try {
      await writeFile(hostileFile, "export default () => null;");
      planted = await Bun.file(hostileFile).exists();
    } catch {
      planted = false;
    }
    if (planted) {
      await expect(generateRouteTypes(hostileApp)).rejects.toThrow(/unsafe route pattern/);
    }
    await rm(hostileApp, { recursive: true, force: true });
  });
});
