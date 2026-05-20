import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  resolveRouteChain,
  resolveLayoutChainFromRegistry,
  type ModuleRegistry,
} from "../server/layout.ts";

const TMP = resolve(import.meta.dir, ".tmp-layout-registry");

// Sentinel default components let us distinguish which module ended up where.
const rootModule = { default: () => "root" } as const;
const blogLayoutModule = { default: () => "blog-layout" } as const;
const blogPostModule = { default: () => "blog-post" } as const;
const indexModule = { default: () => "index" } as const;

const registry: ModuleRegistry = {
  "root.tsx": rootModule,
  "routes/blog/layout.tsx": blogLayoutModule,
  "routes/blog/[slug].tsx": blogPostModule,
  "routes/_index.tsx": indexModule,
};

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(TMP, "routes", "blog"), { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("resolveLayoutChainFromRegistry", () => {
  test("includes root + ancestor layouts in order", () => {
    const r = resolveLayoutChainFromRegistry(
      { filePath: "routes/blog/[slug].tsx", urlPattern: "blog/[slug]", segments: ["blog", { param: "slug" }] },
      registry,
    );
    expect(r.layoutFiles).toEqual(["root.tsx", "routes/blog/layout.tsx"]);
  });

  test("omits root when registry has no root entry", () => {
    const r = resolveLayoutChainFromRegistry(
      { filePath: "routes/_index.tsx", urlPattern: "", segments: [] },
      { "routes/_index.tsx": indexModule },
    );
    expect(r.layoutFiles).toEqual([]);
  });

  test("matches sibling-dir layouts only when route is deeper", () => {
    // urlPattern "blog" → layoutDirs returns [] (no ancestor)
    const r = resolveLayoutChainFromRegistry(
      { filePath: "routes/blog/_index.tsx", urlPattern: "blog", segments: ["blog"] },
      registry,
    );
    expect(r.layoutFiles).toEqual(["root.tsx"]);
  });
});

describe("resolveRouteChain — registry mode", () => {
  test("returns the pre-loaded route module without touching disk", async () => {
    const chain = await resolveRouteChain(
      { filePath: "routes/blog/[slug].tsx", urlPattern: "blog/[slug]", segments: ["blog", { param: "slug" }] },
      // appDir intentionally points at a path that does NOT exist — registry mode
      // must skip every fs check.
      "/nonexistent/appdir",
      registry,
    );
    expect(chain.root.default).toBe(rootModule.default);
    expect(chain.layouts).toHaveLength(1);
    expect(chain.layouts[0].default).toBe(blogLayoutModule.default);
    expect(chain.route.default).toBe(blogPostModule.default);
  });

  test("missing route key yields an empty module shape (no throw)", async () => {
    const chain = await resolveRouteChain(
      { filePath: "routes/missing.tsx", urlPattern: "missing", segments: ["missing"] },
      "/nonexistent",
      registry,
    );
    expect(chain.route.default).toBeUndefined();
    expect(chain.route.loader).toBeUndefined();
    expect(chain.root.default).toBe(rootModule.default);
  });

  test("forward-slash normalisation: filePath with backslashes resolves the same key", async () => {
    const chain = await resolveRouteChain(
      { filePath: "routes\\blog\\[slug].tsx", urlPattern: "blog/[slug]", segments: ["blog", { param: "slug" }] },
      "/nonexistent",
      registry,
    );
    expect(chain.route.default).toBe(blogPostModule.default);
  });
});
