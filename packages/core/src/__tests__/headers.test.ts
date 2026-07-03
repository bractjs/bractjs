import { describe, expect, test } from "bun:test";
import { applyRouteHeaders, resolveHeaders } from "../server/headers.ts";
import type { LayoutChain } from "../server/layout.ts";
import type { LoaderResults } from "../server/loader.ts";
import type { HeadersFunction } from "../shared/route-types.ts";

const params = {};
const req = new Request("http://localhost/");

function chain(parts: {
  root?: HeadersFunction;
  layouts?: (HeadersFunction | undefined)[];
  route?: HeadersFunction;
}): LayoutChain {
  return {
    root: parts.root ? { headers: parts.root } : {},
    layouts: (parts.layouts ?? []).map((h) => (h ? { headers: h } : {})),
    route: parts.route ? { headers: parts.route } : {},
  };
}

function results(over: Partial<LoaderResults> = {}): LoaderResults {
  return { root: null, layouts: [], route: null, ...over };
}

describe("resolveHeaders", () => {
  test("returns null when no module exports headers", () => {
    expect(resolveHeaders(chain({}), results(), params, req)).toBeNull();
  });

  test("collects a single route's headers", () => {
    const merged = resolveHeaders(
      chain({ route: () => ({ "Cache-Control": "max-age=60" }) }),
      results(),
      params,
      req,
    );
    expect(merged?.get("Cache-Control")).toBe("max-age=60");
  });

  test("innermost route wins per key (route over root)", () => {
    const merged = resolveHeaders(
      chain({
        root: () => ({ "Cache-Control": "max-age=0", Vary: "Cookie" }),
        route: () => ({ "Cache-Control": "max-age=300" }),
      }),
      results(),
      params,
      req,
    );
    expect(merged?.get("Cache-Control")).toBe("max-age=300");
    // Root-only key survives.
    expect(merged?.get("Vary")).toBe("Cookie");
  });

  test("parentHeaders carries accumulated values to inner links", () => {
    let seen: string | null = "unset";
    const merged = resolveHeaders(
      chain({
        root: () => ({ "X-From-Root": "1" }),
        route: ({ parentHeaders }) => {
          seen = parentHeaders.get("X-From-Root");
          return {};
        },
      }),
      results(),
      params,
      req,
    );
    expect(seen).toBe("1");
    expect(merged?.get("X-From-Root")).toBe("1");
  });

  test("passes the matching loaderData slice to each link", () => {
    const merged = resolveHeaders(
      chain({ route: ({ loaderData }) => ({ ETag: String((loaderData as { etag: string }).etag) }) }),
      results({ route: { etag: "abc" } }),
      params,
      req,
    );
    expect(merged?.get("ETag")).toBe("abc");
  });

  test("layout headers merge between root and route", () => {
    const merged = resolveHeaders(
      chain({
        root: () => ({ "Cache-Control": "max-age=0" }),
        layouts: [() => ({ "Cache-Control": "max-age=10", Vary: "Accept" })],
        route: () => ({ "Cache-Control": "max-age=60" }),
      }),
      results({ layouts: [null] }),
      params,
      req,
    );
    expect(merged?.get("Cache-Control")).toBe("max-age=60");
    expect(merged?.get("Vary")).toBe("Accept");
  });
});

describe("applyRouteHeaders", () => {
  test("overrides same-key defaults and is a no-op for null", () => {
    const base = new Headers({ "Cache-Control": "no-store", "X-Base": "1" });
    applyRouteHeaders(base, new Headers({ "Cache-Control": "max-age=60" }));
    expect(base.get("Cache-Control")).toBe("max-age=60");
    expect(base.get("X-Base")).toBe("1");

    const base2 = new Headers({ "X-Base": "1" });
    applyRouteHeaders(base2, null);
    expect(base2.get("X-Base")).toBe("1");
  });
});
