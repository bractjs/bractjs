import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateRouteTypes,
  routesFingerprint,
  readFingerprint,
} from "../codegen/route-codegen.ts";

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

  test("emits a fingerprint matching routesFingerprint, and is deterministic", async () => {
    const out = await generateRouteTypes(appDir);
    // Header carries the route fingerprint.
    const embedded = readFingerprint(out);
    expect(embedded).toMatch(/^[0-9a-f]+$/);
    expect(embedded).toBe(await routesFingerprint(["/", "/users/:id"]));
    // Same input → byte-identical output (order-independent / reproducible).
    expect(await generateRouteTypes(appDir)).toBe(out);
    // Pattern union is sorted (deterministic across filesystems).
    expect(out.indexOf('| "/"')).toBeLessThan(out.indexOf('| "/users/:id"'));
  });

  test("routesFingerprint is order-independent", async () => {
    expect(await routesFingerprint(["/a", "/b"])).toBe(await routesFingerprint(["/b", "/a"]));
    expect(await routesFingerprint(["/a"])).not.toBe(await routesFingerprint(["/a", "/b"]));
  });

  test("wires the Register augmentation for typed routing", async () => {
    const regApp = join(tmpdir(), `bract-codegen-register-${Date.now()}`);
    await mkdir(join(regApp, "routes", "users"), { recursive: true });
    await writeFile(join(regApp, "routes", "about.tsx"), "export default () => null;");
    await writeFile(join(regApp, "routes", "users", "[id].tsx"), "export default () => null;");

    const out = await generateRouteTypes(regApp);

    // Bug 1 regression: the augmentation must target the real package name.
    expect(out).toContain('declare module "@bractjs/bractjs"');
    expect(out).not.toMatch(/declare module ['"]bractjs['"]/);

    // Bug 2 regression: the customization maps are AUGMENTED on the package, not
    // re-declared as bare top-level interfaces in the app file.
    expect(out).not.toMatch(/^export interface RouteSearchParamsMap/m);
    expect(out).not.toMatch(/^export interface RouteContextMap/m);
    expect(out).toContain('import type { RouteSearchParamsMap, RouteContextMap, InferSchemaOutput } from "@bractjs/bractjs"');

    // The Register seam carries the route union and a per-route params map.
    expect(out).toContain("interface Register {");
    expect(out).toContain("routes: AppRoutes;");
    expect(out).toMatch(/"\/users\/:id": \{ id: string \};/); // dynamic route → typed params
    expect(out).toMatch(/"\/about": \{\};/);                   // static route → no params

    // Schema-inferred search shapes: a per-route map derived from each route
    // module's `searchSchema` export, registered under `searchOutput`.
    expect(out).toContain("export type GeneratedSearchOutput = {");
    expect(out).toContain('typeof import("./routes/about.tsx") extends { searchSchema: infer S }');
    expect(out).toContain("searchOutput: GeneratedSearchOutput;");

    await rm(regApp, { recursive: true, force: true });
  });

  test("emits no Register augmentation when there are no routes", async () => {
    const emptyApp = join(tmpdir(), `bract-codegen-empty-${Date.now()}`);
    await mkdir(join(emptyApp, "routes"), { recursive: true });
    const out = await generateRouteTypes(emptyApp);
    expect(out).toContain("export type AppRoutes =\n  never;");
    expect(out).not.toContain("interface Register {");
    await rm(emptyApp, { recursive: true, force: true });
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
