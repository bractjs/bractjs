import { test, expect, describe } from "bun:test";
import { buildPath } from "../client/build-path.ts";

describe("buildPath", () => {
  test("substitutes a single :param", () => {
    expect(buildPath("/blog/:id", { id: "42" })).toBe("/blog/42");
  });

  test("substitutes multiple params", () => {
    expect(buildPath("/u/:user/post/:post", { user: "ann", post: "7" })).toBe("/u/ann/post/7");
  });

  test("passes static patterns through untouched", () => {
    expect(buildPath("/about", {})).toBe("/about");
    expect(buildPath("/", {})).toBe("/");
  });

  test("URL-encodes param values", () => {
    expect(buildPath("/search/:q", { q: "a b/c" })).toBe("/search/a%20b%2Fc");
  });

  test("coerces numbers to strings", () => {
    expect(buildPath("/n/:id", { id: 7 })).toBe("/n/7");
  });

  test("leaves an absent param's segment intact (surfaces as an obvious bad URL)", () => {
    expect(buildPath("/blog/:id", {})).toBe("/blog/:id");
  });
});
