import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  generateActionRegistry,
  generateManifestModule,
  generateRouteRegistry,
  writeManifestModule,
  writeModuleRegistries,
} from "../codegen/module-registry.ts";

const TMP = resolve(import.meta.dir, ".tmp-module-registry");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(TMP, "routes", "blog"), { recursive: true });

  await writeFile(join(TMP, "root.tsx"), `export default function Root() { return null; }\n`);
  await writeFile(join(TMP, "routes", "_index.tsx"), `export default function Home() { return null; }\n`);
  await writeFile(
    join(TMP, "routes", "blog", "layout.tsx"),
    `export default function L({ children }: any) { return children; }\n`,
  );
  // Nested route under /blog/ — `routes/blog/layout.tsx` wraps everything in
  // its directory (including a `blog/_index`), per `layoutDirsFromFilePath`.
  await writeFile(
    join(TMP, "routes", "blog", "[slug].tsx"),
    `export default function P() { return null; }\n`,
  );

  await writeFile(
    join(TMP, "contact.server.ts"),
    `"use server";\nexport async function send() { return 1; }\n`,
  );
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("generateRouteRegistry", () => {
  test("emits static imports and module map for root, layout, routes", () => {
    const src = generateRouteRegistry({
      appDir: TMP,
      routes: [
        { filePath: "routes/_index.tsx", urlPattern: "", segments: [] },
        { filePath: "routes/blog/_index.tsx", urlPattern: "blog", segments: ["blog"] },
      ],
      layoutRelPaths: ["routes/blog/layout.tsx"],
      hasRoot: true,
    });

    expect(src).toContain(`import * as mod_root_tsx from "../root.tsx";`);
    expect(src).toContain(`import * as mod_routes_blog_layout_tsx from "../routes/blog/layout.tsx";`);
    expect(src).toContain(`import * as mod_routes__index_tsx from "../routes/_index.tsx";`);
    expect(src).toContain(`"root.tsx": mod_root_tsx,`);
    expect(src).toContain(`"routes/blog/layout.tsx": mod_routes_blog_layout_tsx,`);
    expect(src).toContain(`export const moduleRegistry: ModuleRegistry`);
    expect(src).toContain(`export const routeFiles: RouteFile[]`);
  });

  test("rejects hostile file paths", () => {
    expect(() =>
      generateRouteRegistry({
        appDir: TMP,
        routes: [{ filePath: "routes/`evil`.tsx", urlPattern: "evil", segments: ["evil"] }],
        layoutRelPaths: [],
        hasRoot: false,
      }),
    ).toThrow(/unsafe file path/);
  });

  test("rejects .. segments", () => {
    expect(() =>
      generateRouteRegistry({
        appDir: TMP,
        routes: [{ filePath: "routes/../evil.tsx", urlPattern: "evil", segments: ["evil"] }],
        layoutRelPaths: [],
        hasRoot: false,
      }),
    ).toThrow(/\.\. segment/);
  });
});

describe("generateActionRegistry", () => {
  test("emits static imports and registers each action file", () => {
    const src = generateActionRegistry({
      appDir: TMP,
      actionRelPaths: ["routes/contact.server.ts"],
    });
    expect(src).toContain(`import * as act_routes_contact_server_ts from "../routes/contact.server.ts";`);
    expect(src).toContain(
      `{ relPath: "routes/contact.server.ts", mod: act_routes_contact_server_ts as Record<string, unknown> }`,
    );
  });

  test("rejects hostile action paths", () => {
    expect(() =>
      generateActionRegistry({
        appDir: TMP,
        actionRelPaths: ["routes/`evil`.server.ts"],
      }),
    ).toThrow(/unsafe file path/);
  });
});

describe("writeModuleRegistries", () => {
  test("scans the fixture app and writes both registry files", async () => {
    const { routesPath, actionsPath } = await writeModuleRegistries(TMP);
    expect(routesPath).toBe(resolve(join(TMP, "_generated", "routes.ts")));
    expect(actionsPath).toBe(resolve(join(TMP, "_generated", "actions.ts")));

    const routesSrc = await Bun.file(routesPath).text();
    expect(routesSrc).toContain(`import * as mod_root_tsx from "../root.tsx";`);
    // Layout is discovered because `routes/blog/[slug].tsx` is a deeper route
    expect(routesSrc).toContain(`"routes/blog/layout.tsx": `);
    expect(routesSrc).toContain(`urlPattern: ""`);

    const actionsSrc = await Bun.file(actionsPath).text();
    expect(actionsSrc).toContain(`relPath: "contact.server.ts"`);
  });
});

describe("generateManifestModule", () => {
  test("emits a ServerManifest constant with file+chunk per route", () => {
    const src = generateManifestModule({
      version: 1,
      mode: "production",
      clientEntry: "/build/client/entry.abc.js",
      rootChunk: "/build/client/root.def.js",
      routes: {
        "": { chunk: "/build/client/_index.ghi.js", pattern: "" },
        blog: { chunk: "/build/client/blog.jkl.js", pattern: "blog" },
      },
    });
    expect(src).toContain(`export const manifest: ServerManifest =`);
    expect(src).toContain(`"clientEntry": "/build/client/entry.abc.js"`);
    expect(src).toContain(`"rootChunk": "/build/client/root.def.js"`);
    // Each route entry exposes both `file` and `chunk` keys (mirrors the
    // RouteManifest → ServerManifest projection in serve.ts).
    expect(src).toContain(`"file": "/build/client/_index.ghi.js"`);
    expect(src).toContain(`"chunk": "/build/client/_index.ghi.js"`);
  });

  test("string escaping resists injection through chunk paths", () => {
    const src = generateManifestModule({
      clientEntry: `evil"; throw new Error('pwned'); //`,
      routes: {},
    });
    // JSON.stringify escapes the inner quote — the throw doesn't break out.
    expect(src).toContain(`\\"; throw new Error`);
    expect(src).not.toContain(`evil"; throw`);
  });
});

describe("writeManifestModule", () => {
  test("reads route-manifest.json and writes _generated/manifest.ts", async () => {
    const tmpBuild = resolve(join(TMP, ".tmp-build"));
    await mkdir(tmpBuild, { recursive: true });
    await writeFile(
      join(tmpBuild, "route-manifest.json"),
      JSON.stringify({
        version: 1,
        mode: "production",
        clientEntry: "/build/client/entry.abc.js",
        routes: { "": { chunk: "/build/client/_index.ghi.js", pattern: "" } },
      }),
    );
    const out = await writeManifestModule(TMP, tmpBuild);
    expect(out).toBe(resolve(join(TMP, "_generated", "manifest.ts")));
    const src = await Bun.file(out).text();
    expect(src).toContain(`"clientEntry": "/build/client/entry.abc.js"`);
  });

  test("throws a clear error when route-manifest.json is missing", async () => {
    let caught: unknown;
    try {
      await writeManifestModule(TMP, "/this/path/does/not/exist-bract-manifest");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("Run the client build before manifest codegen");
  });
});
