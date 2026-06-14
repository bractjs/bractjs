import { test, expect, describe } from "bun:test";
import { buildMatches } from "../server/matches.ts";
import type { LayoutChain } from "../server/layout.ts";
import type { LoaderResults } from "../server/loader.ts";

describe("buildMatches", () => {
  test("returns root → layouts → route in order with ids and data", () => {
    const chain: LayoutChain = {
      root: { handle: { breadcrumb: "Home" } },
      layouts: [{ handle: { breadcrumb: "Blog" } }],
      route: { handle: { breadcrumb: "Post" } },
      files: { root: "root.tsx", layouts: ["routes/blog/layout.tsx"], route: "routes/blog/[id].tsx" },
    };
    const data: LoaderResults = { root: { user: "a" }, layouts: [{ posts: 2 }], route: { id: "7" } };

    const matches = buildMatches(chain, data, { id: "7" }, "/blog/7");

    expect(matches.map((m) => m.id)).toEqual([
      "root.tsx",
      "routes/blog/layout.tsx",
      "routes/blog/[id].tsx",
    ]);
    expect(matches.map((m) => m.handle?.breadcrumb)).toEqual(["Home", "Blog", "Post"]);
    expect(matches[2].data).toEqual({ id: "7" });
    expect(matches[1].data).toEqual({ posts: 2 });
    // params + pathname shared across the chain.
    expect(matches.every((m) => m.pathname === "/blog/7")).toBe(true);
    expect(matches.every((m) => m.params.id === "7")).toBe(true);
  });

  test("handle is undefined when a module does not export it", () => {
    const chain: LayoutChain = {
      root: {},
      layouts: [],
      route: { handle: { title: "x" } },
      files: { root: "root.tsx", layouts: [], route: "routes/_index.tsx" },
    };
    const data: LoaderResults = { root: null, layouts: [], route: null };
    const matches = buildMatches(chain, data, {}, "/");
    expect(matches[0].handle).toBeUndefined();
    expect(matches[1].handle).toEqual({ title: "x" });
  });

  test("falls back to synthetic ids when files metadata is absent", () => {
    const chain: LayoutChain = {
      root: {},
      layouts: [{}],
      route: {},
    };
    const data: LoaderResults = { root: null, layouts: [null], route: null };
    const matches = buildMatches(chain, data, {}, "/x");
    expect(matches.map((m) => m.id)).toEqual(["root", "layout:0", "route"]);
  });
});
