// A `root.ts` app (or one with no root module at all) resolves the same chain
// in every run mode: the registry path (compiled binary / Node build), the dev
// filesystem path, and codegen. The first layout is never mistaken for root.
// (Modules are told apart by their `handle` export, which the route-module
// projection keeps.)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateRouteRegistry } from "../codegen/module-registry.ts";
import { resolveLayoutChainFromRegistry, resolveRootChain, resolveRouteChain } from "../server/layout.ts";
import { resolveRootFile, resolveRootFileSync, rootKeyIn } from "../server/root-file.ts";

const TMP = resolve(import.meta.dir, `.tmp-root-ts-${Date.now()}`);
const WITH_TS = join(TMP, "with-root-ts");
const NO_ROOT = join(TMP, "no-root");
const post = {
  filePath: "routes/blog/[slug].tsx",
  urlPattern: "blog/[slug]",
  segments: ["blog", { param: "slug" }],
};

beforeAll(async () => {
  for (const dir of [WITH_TS, NO_ROOT]) {
    await mkdir(join(dir, "routes", "blog"), { recursive: true });
    await writeFile(
      join(dir, "routes", "blog", "layout.tsx"),
      `export const handle = { id: "blog-layout" };\n`,
    );
    await writeFile(join(dir, "routes", "blog", "[slug].tsx"), `export const handle = { id: "post" };\n`);
  }
  await writeFile(join(WITH_TS, "root.ts"), `export const handle = { id: "root-ts" };\n`);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("resolveRootFile", () => {
  test("finds root.ts, prefers root.tsx, and reports none", async () => {
    expect(await resolveRootFile(WITH_TS)).toBe("root.ts");
    expect(resolveRootFileSync(WITH_TS)).toBe("root.ts");
    expect(await resolveRootFile(NO_ROOT)).toBeNull();
    expect(rootKeyIn({ "root.ts": {}, "root.tsx": {} })).toBe("root.tsx");
    expect(rootKeyIn({ "routes/x.tsx": {} })).toBeUndefined();
  });
});

describe("dev (filesystem) chain", () => {
  test("a root.ts app: root is root.ts, the layout stays a layout", async () => {
    const chain = await resolveRouteChain(post, WITH_TS);
    expect(chain.files?.root).toBe("root.ts");
    expect(chain.root.handle).toEqual({ id: "root-ts" });
    expect(chain.files?.layouts).toEqual(["routes/blog/layout.tsx"]);
    expect(chain.layouts[0].handle).toEqual({ id: "blog-layout" });
  });

  test("an app without a root module: the first layout is NOT promoted to root", async () => {
    const chain = await resolveRouteChain(post, NO_ROOT);
    expect(chain.files?.root).toBeUndefined();
    expect(chain.root).toEqual({});
    expect(chain.layouts).toHaveLength(1);
    expect(chain.layouts[0].handle).toEqual({ id: "blog-layout" });
  });

  test("the 404 chain finds root.ts", async () => {
    const chain = await resolveRootChain(WITH_TS);
    expect(chain.files?.root).toBe("root.ts");
  });
});

describe("registry (compiled) chain", () => {
  test("root.ts key, and no root → no promotion of the first layout", async () => {
    const layout = { id: "blog-layout" };
    const withTs = resolveLayoutChainFromRegistry(post, { "root.ts": {}, "routes/blog/layout.tsx": layout });
    expect(withTs.rootFile).toBe("root.ts");
    expect(withTs.layoutFiles).toEqual(["root.ts", "routes/blog/layout.tsx"]);

    const chain = await resolveRouteChain(post, "/unused", {
      "routes/blog/layout.tsx": layout,
      [post.filePath]: {},
    });
    expect(chain.files?.root).toBeUndefined();
    expect(chain.layouts).toHaveLength(1);
    expect(chain.files?.layouts).toEqual(["routes/blog/layout.tsx"]);
  });
});

describe("codegen", () => {
  test("a root.ts app's registry imports ../root.ts under the root.ts key", () => {
    const src = generateRouteRegistry({
      appDir: WITH_TS,
      routes: [post],
      layoutRelPaths: ["routes/blog/layout.tsx"],
      hasRoot: true,
      rootFile: "root.ts",
    });
    expect(src).toContain(`from "../root.ts";`);
    expect(src).toContain(`"root.ts": mod_root_ts,`);
    expect(src).not.toContain("../root.tsx");
  });
});
