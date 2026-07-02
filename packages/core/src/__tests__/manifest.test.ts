import { describe, expect, test } from "bun:test";
import { generateManifest } from "../build/manifest.ts";

describe("generateManifest", () => {
  test("version is always 1", () => {
    const m = generateManifest({ clientEntry: "/build/client.js", routeChunks: new Map() });
    expect(m.version).toBe(1);
  });

  test("sets clientEntry field", () => {
    const m = generateManifest({ clientEntry: "/build/client.abc123.js", routeChunks: new Map() });
    expect(m.clientEntry).toBe("/build/client.abc123.js");
  });

  test("converts routeChunks map to routes object", () => {
    const chunks = new Map([
      ["", "/build/route-index.abc.js"],
      ["about", "/build/route-about.def.js"],
    ]);
    const m = generateManifest({ clientEntry: "/build/client.js", routeChunks: chunks });
    expect(m.routes[""]).toEqual({ chunk: "/build/route-index.abc.js", pattern: "" });
    expect(m.routes["about"]).toEqual({ chunk: "/build/route-about.def.js", pattern: "about" });
  });

  test("empty routeChunks produces empty routes object", () => {
    const m = generateManifest({ clientEntry: "/client.js", routeChunks: new Map() });
    expect(Object.keys(m.routes)).toHaveLength(0);
  });

  test("sets optional rootChunk when provided", () => {
    const m = generateManifest({
      clientEntry: "/client.js",
      rootChunk: "/build/root.chunk.js",
      routeChunks: new Map(),
    });
    expect(m.rootChunk).toBe("/build/root.chunk.js");
  });

  test("rootChunk is undefined when not provided", () => {
    const m = generateManifest({ clientEntry: "/client.js", routeChunks: new Map() });
    expect(m.rootChunk).toBeUndefined();
  });

  test("each route entry has both chunk and pattern fields", () => {
    const chunks = new Map([["blog/[id]", "/build/blog-id.chunk.js"]]);
    const m = generateManifest({ clientEntry: "/client.js", routeChunks: chunks });
    const entry = m.routes["blog/[id]"];
    expect(entry.chunk).toBe("/build/blog-id.chunk.js");
    expect(entry.pattern).toBe("blog/[id]");
  });

  test("handles many routes", () => {
    const chunks = new Map(Array.from({ length: 20 }, (_, i) => [`route/${i}`, `/build/chunk-${i}.js`]));
    const m = generateManifest({ clientEntry: "/client.js", routeChunks: chunks });
    expect(Object.keys(m.routes)).toHaveLength(20);
    expect(m.routes["route/10"].chunk).toBe("/build/chunk-10.js");
  });
});
