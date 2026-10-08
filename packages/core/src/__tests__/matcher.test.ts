import { describe, expect, test } from "bun:test";
import { buildTrie, matchRoute } from "../server/matcher.ts";
import type { RouteFile } from "../server/scanner.ts";
import { pathToSegments } from "../server/scanner.ts";

function makeRoute(pattern: string): RouteFile {
  return { filePath: `routes/${pattern}.tsx`, urlPattern: pattern, segments: pathToSegments(pattern) };
}

describe("matchRoute", () => {
  test("matches exact static route /about", () => {
    const trie = buildTrie([makeRoute("about")]);
    const result = matchRoute("/about", trie);
    expect(result).not.toBeNull();
    expect(result?.routeFile.urlPattern).toBe("about");
    expect(result?.params).toEqual({});
  });

  test("matches index route /", () => {
    const trie = buildTrie([makeRoute("")]);
    const result = matchRoute("/", trie);
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({});
  });

  test("matches /blog/42 with params.id = '42'", () => {
    const trie = buildTrie([makeRoute("blog/[id]")]);
    const result = matchRoute("/blog/42", trie);
    expect(result).not.toBeNull();
    expect(result?.params).toEqual({ id: "42" });
  });

  test("prefers static /blog/new over dynamic /blog/[id]", () => {
    const trie = buildTrie([makeRoute("blog/[id]"), makeRoute("blog/new")]);
    const result = matchRoute("/blog/new", trie);
    expect(result?.routeFile.urlPattern).toBe("blog/new");
  });

  test("matches /docs/a/b/c as catch-all with slug = 'a/b/c'", () => {
    const trie = buildTrie([makeRoute("docs/[...slug]")]);
    const result = matchRoute("/docs/a/b/c", trie);
    expect(result).not.toBeNull();
    expect(result?.params.slug).toBe("a/b/c");
  });

  test("returns null for unmatched pathname", () => {
    const trie = buildTrie([makeRoute("about")]);
    expect(matchRoute("/missing", trie)).toBeNull();
  });

  test("returns null for empty trie", () => {
    const trie = buildTrie([]);
    expect(matchRoute("/anything", trie)).toBeNull();
  });

  test("matches nested static /blog/posts/featured", () => {
    const trie = buildTrie([makeRoute("blog/posts/featured")]);
    const result = matchRoute("/blog/posts/featured", trie);
    expect(result).not.toBeNull();
  });

  test("param does not match when static exists at same depth", () => {
    const trie = buildTrie([makeRoute("users/profile"), makeRoute("users/[id]")]);
    const r1 = matchRoute("/users/profile", trie);
    expect(r1?.routeFile.urlPattern).toBe("users/profile");
    const r2 = matchRoute("/users/123", trie);
    expect(r2?.params.id).toBe("123");
  });
});

describe("optional segments [[id]]", () => {
  test("matches with the segment present (binds the param)", () => {
    const trie = buildTrie([makeRoute("users/[[id]]")]);
    const r = matchRoute("/users/42", trie);
    expect(r).not.toBeNull();
    expect(r?.params).toEqual({ id: "42" });
  });

  test("matches with the segment absent (param unset)", () => {
    const trie = buildTrie([makeRoute("users/[[id]]")]);
    const r = matchRoute("/users", trie);
    expect(r).not.toBeNull();
    expect(r?.params).toEqual({});
  });

  test("static sibling still wins over the optional param", () => {
    const trie = buildTrie([makeRoute("users/[[id]]"), makeRoute("users/me")]);
    const r = matchRoute("/users/me", trie);
    expect(r?.routeFile.urlPattern).toBe("users/me");
  });

  // The Remix `($lang).about.tsx` shape: an optional segment that is NOT last.
  test("mid-path optional matches with the segment absent", () => {
    const trie = buildTrie([makeRoute("[[lang]]/about")]);
    expect(matchRoute("/about", trie)?.params).toEqual({});
    expect(matchRoute("/en/about", trie)?.params).toEqual({ lang: "en" });
  });

  test("static segment after an optional beats binding it to the param", () => {
    const trie = buildTrie([makeRoute("[[lang]]"), makeRoute("[[lang]]/about")]);
    expect(matchRoute("/about", trie)?.routeFile.urlPattern).toBe("[[lang]]/about");
    expect(matchRoute("/fr", trie)).toEqual({ routeFile: expect.anything(), params: { lang: "fr" } });
    expect(matchRoute("/fr", trie)?.routeFile.urlPattern).toBe("[[lang]]");
    expect(matchRoute("/", trie)?.routeFile.urlPattern).toBe("[[lang]]");
  });

  test("mid-path optional followed by a param", () => {
    const trie = buildTrie([makeRoute("[[lang]]/posts/[id]")]);
    expect(matchRoute("/posts/7", trie)?.params).toEqual({ id: "7" });
    expect(matchRoute("/de/posts/7", trie)?.params).toEqual({ lang: "de", id: "7" });
    expect(matchRoute("/de/posts", trie)).toBeNull();
  });

  test("consecutive optionals can each be omitted", () => {
    const trie = buildTrie([makeRoute("[[lang]]/[[region]]/shop")]);
    expect(matchRoute("/shop", trie)?.params).toEqual({});
    expect(matchRoute("/en/shop", trie)?.params).toEqual({ lang: "en" });
    expect(matchRoute("/en/us/shop", trie)?.params).toEqual({ lang: "en", region: "us" });
  });

  test("does not over-consume — extra segment falls through to catch-all", () => {
    const trie = buildTrie([makeRoute("users/[[id]]"), makeRoute("users/[...rest]")]);
    const r = matchRoute("/users/1/2", trie);
    expect(r?.routeFile.urlPattern).toBe("users/[...rest]");
    expect(r?.params.rest).toBe("1/2");
  });
});

describe("param values are percent-decoded (React Router parity)", () => {
  test("[param]: spaces and non-ASCII", () => {
    const trie = buildTrie([makeRoute("posts/[id]")]);
    expect(matchRoute("/posts/a%20b", trie)?.params).toEqual({ id: "a b" });
    expect(matchRoute("/posts/%C3%BCber", trie)?.params).toEqual({ id: "über" });
  });

  test("a malformed escape is left as written instead of failing the match", () => {
    const trie = buildTrie([makeRoute("posts/[id]")]);
    expect(matchRoute("/posts/%E0%A4%A", trie)?.params).toEqual({ id: "%E0%A4%A" });
  });

  test("[[optional]] is decoded when present", () => {
    const trie = buildTrie([makeRoute("users/[[id]]")]);
    expect(matchRoute("/users/j%C3%B8rn", trie)?.params).toEqual({ id: "jørn" });
    expect(matchRoute("/users", trie)?.params).toEqual({});
  });

  test("[...splat]: each segment decoded, real slashes stay the separators", () => {
    const trie = buildTrie([makeRoute("docs/[...slug]")]);
    expect(matchRoute("/docs/a%20b/c", trie)?.params).toEqual({ slug: "a b/c" });
    // An encoded slash inside one segment becomes a literal "/" in the value.
    expect(matchRoute("/docs/a%2Fb/c", trie)?.params).toEqual({ slug: "a/b/c" });
  });

  test("static segments are compared raw (no decoding of the route itself)", () => {
    const trie = buildTrie([makeRoute("about")]);
    expect(matchRoute("/%61bout", trie)).toBeNull();
  });

  test("buildPath → matchRoute round-trips a value that needs encoding", async () => {
    const { buildPath } = await import("../client/build-path.ts");
    const trie = buildTrie([makeRoute("search/[q]")]);
    const value = "a b/c ü?&#";
    expect(matchRoute(buildPath("/search/:q", { q: value }), trie)?.params).toEqual({ q: value });
  });
});
