import { describe, expect, test } from "bun:test";
import { createLocationKey, matchPatternForPath, parseTo } from "../client/nav-utils.ts";
import { buildTrie, matchRoute } from "../server/matcher.ts";
import type { ServerManifest } from "../server/render.ts";
import { pathToSegments } from "../server/scanner.ts";

describe("parseTo", () => {
  test("plain pathname", () => {
    expect(parseTo("/posts")).toEqual({ pathname: "/posts", search: "", hash: "" });
  });

  test("pathname + search", () => {
    expect(parseTo("/posts?page=2")).toEqual({ pathname: "/posts", search: "?page=2", hash: "" });
  });

  test("pathname + hash", () => {
    expect(parseTo("/docs#install")).toEqual({ pathname: "/docs", search: "", hash: "#install" });
  });

  test("pathname + search + hash", () => {
    expect(parseTo("/docs?v=2#install")).toEqual({ pathname: "/docs", search: "?v=2", hash: "#install" });
  });

  test("hash containing a question mark stays in the hash", () => {
    expect(parseTo("/docs#frag?notsearch")).toEqual({
      pathname: "/docs",
      search: "",
      hash: "#frag?notsearch",
    });
  });

  test("empty string falls back to root", () => {
    expect(parseTo("")).toEqual({ pathname: "/", search: "", hash: "" });
  });

  test("bare query string keeps root pathname", () => {
    expect(parseTo("?page=2")).toEqual({ pathname: "/", search: "?page=2", hash: "" });
  });

  test("root with everything", () => {
    expect(parseTo("/?a=1&b=2#top")).toEqual({ pathname: "/", search: "?a=1&b=2", hash: "#top" });
  });
});

describe("createLocationKey", () => {
  test("returns a short non-empty string and varies between calls", () => {
    const a = createLocationKey();
    const b = createLocationKey();
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(a.length).toBeLessThanOrEqual(10);
    expect(a).not.toBe(b);
  });
});

// The client router picks a route chunk with its own matcher; if it disagrees
// with the server trie, the client loads the wrong module (or none) and
// soft-navigation/hydration renders the wrong page.
describe("matchPatternForPath agrees with the server matcher", () => {
  const patterns = [
    "",
    "about",
    "users/[[id]]",
    "users/me",
    "blog/[id]",
    "docs/[...slug]",
    "[[lang]]/pricing",
    "[[lang]]/posts/[id]",
    "[[lang]]/[[region]]/shop",
    // Regression: the old scorer let [...slug] match zero segments and ranked
    // three params above a static-prefixed catch-all.
    "[page]",
    "[org]/[repo]/[branch]",
  ];
  const manifest = {
    routes: Object.fromEntries(patterns.map((p) => [p, { chunk: `/${p}.js`, pattern: p }])),
  } as unknown as ServerManifest;
  const trie = buildTrie(
    patterns.map((p) => ({ filePath: `routes/${p}.tsx`, urlPattern: p, segments: pathToSegments(p) })),
  );

  const paths = [
    "/",
    "/about",
    "/users",
    "/users/42",
    "/users/me",
    "/blog/1",
    "/docs/a/b/c",
    "/pricing",
    "/en/pricing",
    "/posts/7",
    "/de/posts/7",
    "/shop",
    "/en/shop",
    "/en/us/shop",
    "/nope/nope/nope/nope",
    "/docs",
    "/docs/a/b",
    "/x",
    "/a/b/c",
  ];
  for (const path of paths) {
    test(path, () => {
      expect(matchPatternForPath(path, manifest)).toBe(matchRoute(path, trie)?.routeFile.urlPattern ?? null);
    });
  }
});
