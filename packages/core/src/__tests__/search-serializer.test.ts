import { describe, expect, test } from "bun:test";
import { serializeSearch, withSearch } from "../client/search-serializer.ts";

describe("serializeSearch", () => {
  test("primitives stringify", () => {
    expect(serializeSearch({ page: 2, q: "hi", on: true })).toBe("?page=2&q=hi&on=true");
  });

  test("undefined/null drop the key", () => {
    expect(serializeSearch({ a: 1, b: undefined, c: null })).toBe("?a=1");
  });

  test("arrays become repeated keys (inverse of searchParamsToObject)", () => {
    expect(serializeSearch({ tag: ["a", "b"] })).toBe("?tag=a&tag=b");
  });

  test("nested objects JSON-stringify", () => {
    expect(serializeSearch({ f: { x: 1 } })).toBe("?f=" + encodeURIComponent('{"x":1}'));
  });

  test("empty object → empty string", () => {
    expect(serializeSearch({})).toBe("");
  });

  test("values are URL-encoded", () => {
    expect(serializeSearch({ q: "a b&c" })).toBe("?q=a+b%26c");
  });
});

describe("withSearch", () => {
  test("appends search to a bare path", () => {
    expect(withSearch("/posts", { page: 2 })).toBe("/posts?page=2");
  });

  test("replaces an existing query, preserves the hash", () => {
    expect(withSearch("/posts?old=1#top", { page: 2 })).toBe("/posts?page=2#top");
  });

  test("no search → path untouched", () => {
    expect(withSearch("/posts?old=1")).toBe("/posts?old=1");
  });
});
