import { describe, expect, test } from "bun:test";
import { createLocationKey, parseTo } from "../client/nav-utils.ts";

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
