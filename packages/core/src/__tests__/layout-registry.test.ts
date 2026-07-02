import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type ModuleRegistry, resolveLayoutChainFromRegistry, resolveRouteChain } from "../server/layout.ts";

const TMP = resolve(import.meta.dir, ".tmp-layout-registry");

// Sentinel default components let us distinguish which module ended up where.
const rootModule = { default: () => "root" } as const;
const blogLayoutModule = { default: () => "blog-layout" } as const;
const blogPostModule = { default: () => "blog-post" } as const;
const indexModule = { default: () => "index" } as const;

// Module exporting the security-sensitive gate (beforeLoad) + context factory.
const guardBeforeLoad = () => new Response("Forbidden", { status: 403 });
const guardContextFactory = { _factory: () => ({ user: null }) };
const guardedModule = {
  default: () => "guarded",
  beforeLoad: guardBeforeLoad,
  context: guardContextFactory,
} as const;

const registry: ModuleRegistry = {
  "root.tsx": rootModule,
  "routes/blog/layout.tsx": blogLayoutModule,
  "routes/blog/[slug].tsx": blogPostModule,
  "routes/_index.tsx": indexModule,
  "routes/guarded.tsx": guardedModule,
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
      {
        filePath: "routes/blog/[slug].tsx",
        urlPattern: "blog/[slug]",
        segments: ["blog", { param: "slug" }],
      },
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

  test("wraps a folder index in that folder's layout", () => {
    // routes/blog/_index.tsx (URL /blog) lives inside routes/blog/, so the
    // sibling routes/blog/layout.tsx wraps it — matching Remix/RR/Next, where
    // an index is nested under its directory's layout. Layout dirs are derived
    // from the FILE path, so the `_index` → `blog` urlPattern collapse no
    // longer hides the ancestor directory.
    const r = resolveLayoutChainFromRegistry(
      { filePath: "routes/blog/_index.tsx", urlPattern: "blog", segments: ["blog"] },
      registry,
    );
    expect(r.layoutFiles).toEqual(["root.tsx", "routes/blog/layout.tsx"]);
  });
});

describe("resolveRouteChain — registry mode", () => {
  test("returns the pre-loaded route module without touching disk", async () => {
    const chain = await resolveRouteChain(
      {
        filePath: "routes/blog/[slug].tsx",
        urlPattern: "blog/[slug]",
        segments: ["blog", { param: "slug" }],
      },
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
      {
        filePath: "routes\\blog\\[slug].tsx",
        urlPattern: "blog/[slug]",
        segments: ["blog", { param: "slug" }],
      },
      "/nonexistent",
      registry,
    );
    expect(chain.route.default).toBe(blogPostModule.default);
  });

  // SECURITY(high) regression guard: beforeLoad (the auth gate) and the context
  // factory must survive module projection. Dropping them silently disables
  // every beforeLoad() — see importRouteModule/pickRouteModule in layout.ts.
  test("projects beforeLoad and context factory through registry mode", async () => {
    const chain = await resolveRouteChain(
      { filePath: "routes/guarded.tsx", urlPattern: "guarded", segments: ["guarded"] },
      "/nonexistent",
      registry,
    );
    expect(chain.route.beforeLoad).toBe(guardBeforeLoad);
    expect((chain.route as { context?: unknown }).context).toBe(guardContextFactory);
  });
});
