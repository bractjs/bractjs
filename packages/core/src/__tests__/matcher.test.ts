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

  test("does not over-consume — extra segment falls through to catch-all", () => {
    const trie = buildTrie([makeRoute("users/[[id]]"), makeRoute("users/[...rest]")]);
    const r = matchRoute("/users/1/2", trie);
    expect(r?.routeFile.urlPattern).toBe("users/[...rest]");
    expect(r?.params.rest).toBe("1/2");
  });
});
