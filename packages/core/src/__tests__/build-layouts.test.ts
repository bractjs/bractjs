import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { attachLayouts, outputRelPath, routeLayoutFiles } from "../build/layouts.ts";
import { generateManifest } from "../build/manifest.ts";
import { pathToSegments, type RouteFile } from "../server/scanner.ts";

const TMP = resolve(import.meta.dir, ".tmp-build-layouts");

function route(filePath: string, urlPattern: string): RouteFile {
  return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
}

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  for (const dir of ["routes/blog", "routes/blog/admin", "routes/(shop)/cart"]) {
    await mkdir(resolve(TMP, dir), { recursive: true });
  }
  await writeFile(resolve(TMP, "routes/blog/layout.tsx"), "export default () => null;");
  // .tsx wins over .ts in the same directory, like the server's resolver.
  await writeFile(resolve(TMP, "routes/blog/admin/layout.tsx"), "export default () => null;");
  await writeFile(resolve(TMP, "routes/blog/admin/layout.ts"), "export const loader = () => 1;");
  await writeFile(resolve(TMP, "routes/(shop)/layout.ts"), "export const loader = () => 1;");
});

afterAll(() => rm(TMP, { recursive: true, force: true }));

describe("routeLayoutFiles", () => {
  test("resolves each route's layouts outermost first, preferring .tsx", async () => {
    const byPattern = await routeLayoutFiles(TMP, [
      route("routes/about.tsx", "about"),
      route("routes/blog/[id].tsx", "blog/[id]"),
      route("routes/blog/admin/edit.tsx", "blog/admin/edit"),
      route("routes/(shop)/cart/index.tsx", "cart/index"),
    ]);
    expect(byPattern.get("about")).toEqual([]);
    expect(byPattern.get("blog/[id]")).toEqual(["routes/blog/layout.tsx"]);
    expect(byPattern.get("blog/admin/edit")).toEqual([
      "routes/blog/layout.tsx",
      "routes/blog/admin/layout.tsx",
    ]);
    // Route groups contribute their layout even though they add no URL segment.
    expect(byPattern.get("cart/index")).toEqual(["routes/(shop)/layout.ts"]);
  });
});

describe("attachLayouts + generateManifest", () => {
  test("routes list their layout chunks; layout CSS precedes the route's", () => {
    const layoutFiles = new Map([
      ["blog/admin/edit", ["routes/blog/layout.tsx", "routes/blog/admin/layout.tsx"]],
      ["about", []],
    ]);
    const layoutChunks = new Map([
      ["routes/blog/layout.tsx", "/build/client/app/routes/blog/layout.1.js"],
      ["routes/blog/admin/layout.tsx", "/build/client/app/routes/blog/admin/layout.2.js"],
    ]);
    const layoutCss = new Map([["routes/blog/layout.tsx", ["/build/client/blog.css"]]]);
    const routeCss = new Map([["blog/admin/edit", ["/build/client/edit.css"]]]);
    const routeLayouts = attachLayouts(layoutFiles, layoutChunks, layoutCss, routeCss);

    const manifest = generateManifest({
      clientEntry: "/build/client/client.js",
      routeChunks: new Map([
        ["blog/admin/edit", "/build/client/edit.js"],
        ["about", "/build/client/about.js"],
      ]),
      routeCss,
      routeLayouts,
    });
    expect(manifest.routes["blog/admin/edit"]).toEqual({
      chunk: "/build/client/edit.js",
      pattern: "blog/admin/edit",
      css: ["/build/client/blog.css", "/build/client/edit.css"],
      layouts: [
        "/build/client/app/routes/blog/layout.1.js",
        "/build/client/app/routes/blog/admin/layout.2.js",
      ],
    });
    // No layouts, no CSS → no keys (manifests stay byte-identical for such apps).
    expect(manifest.routes.about).toEqual({ chunk: "/build/client/about.js", pattern: "about" });
  });

  test("outputRelPath mirrors Bun's output layout", () => {
    expect(outputRelPath("app", "routes/blog/layout.tsx")).toBe("app/routes/blog/layout.js");
  });
});
