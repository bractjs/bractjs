import { describe, expect, test } from "bun:test";
import { formatRouteTable } from "../dev/route-table.ts";

describe("formatRouteTable", () => {
  test("empty → a clear no-routes line", () => {
    expect(formatRouteTable([])).toBe("[bractjs] no routes found under routes/");
  });

  test("lists routes sorted by pattern with loader/action markers", () => {
    const out = formatRouteTable([
      { pattern: "/blog/:id", file: "routes/blog/[id].tsx", hasLoader: true, hasAction: true },
      { pattern: "/", file: "routes/_index.tsx", hasLoader: true, hasAction: false },
    ]);
    // Header reports the count.
    expect(out).toContain("[bractjs] 2 routes:");
    // Sorted: "/" before "/blog/:id".
    expect(out.indexOf("routes/_index.tsx")).toBeLessThan(out.indexOf("routes/blog/[id].tsx"));
    // Markers present.
    expect(out).toContain("loader");
    expect(out).toContain("action");
    // The index route shows loader but not action.
    const indexLine = out.split("\n").find((l) => l.includes("_index"))!;
    expect(indexLine).toContain("loader");
    expect(indexLine).not.toContain("action");
  });

  test("singular wording for one route", () => {
    const out = formatRouteTable([
      { pattern: "/", file: "routes/_index.tsx", hasLoader: false, hasAction: false },
    ]);
    expect(out).toContain("1 route:");
  });
});
