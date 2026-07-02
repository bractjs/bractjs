import { describe, expect, test } from "bun:test";
import { Deferred, defer, isDeferred, promisesOf, stripDeferred } from "../shared/deferred.ts";

describe("Deferred", () => {
  test("holds a promise", () => {
    const p = Promise.resolve(42);
    const d = new Deferred(p);
    expect(d.promise).toBe(p);
  });

  test("isDeferred returns true for Deferred instances", () => {
    expect(isDeferred(new Deferred(Promise.resolve()))).toBe(true);
  });

  test("isDeferred returns false for plain promises", () => {
    expect(isDeferred(Promise.resolve())).toBe(false);
  });

  test("isDeferred returns false for non-objects", () => {
    expect(isDeferred(null)).toBe(false);
    expect(isDeferred(42)).toBe(false);
    expect(isDeferred("string")).toBe(false);
  });
});

describe("defer", () => {
  test("wraps Promise values in Deferred", () => {
    const result = defer({ data: Promise.resolve([1, 2, 3]) });
    expect(isDeferred(result.data)).toBe(true);
  });

  test("passes through non-Promise values unchanged", () => {
    const result = defer({ count: 5, label: "hello" });
    expect(result.count).toBe(5);
    expect(result.label).toBe("hello");
    expect(isDeferred(result.count)).toBe(false);
  });

  test("mixed: some deferred, some immediate", () => {
    const p = Promise.resolve("async-val");
    const result = defer({ sync: "immediate", async: p });
    expect(result.sync).toBe("immediate");
    expect(isDeferred(result.async)).toBe(true);
  });

  test("empty object returns empty object", () => {
    const result = defer({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("stripDeferred", () => {
  test("returns only non-deferred values", () => {
    const input = defer({ a: 1, b: Promise.resolve(2) });
    const stripped = stripDeferred(input as Record<string, unknown>);
    expect(stripped).toHaveProperty("a", 1);
    expect(stripped).not.toHaveProperty("b");
  });

  test("returns all values when nothing is deferred", () => {
    const stripped = stripDeferred({ x: 10, y: "hello" });
    expect(stripped).toEqual({ x: 10, y: "hello" });
  });

  test("returns empty object when everything is deferred", () => {
    const input = defer({ a: Promise.resolve(1), b: Promise.resolve(2) });
    const stripped = stripDeferred(input as Record<string, unknown>);
    expect(Object.keys(stripped)).toHaveLength(0);
  });
});

describe("promisesOf", () => {
  test("returns only deferred values as their underlying promises", async () => {
    const p = Promise.resolve(99);
    const input = defer({ fast: "sync", slow: p });
    const promises = promisesOf(input as Record<string, unknown>);
    expect(Object.keys(promises)).toEqual(["slow"]);
    const val = await promises.slow;
    expect(val).toBe(99);
  });

  test("returns empty object when nothing is deferred", () => {
    const result = promisesOf({ a: 1, b: "hello" });
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("each promise in result resolves to deferred value", async () => {
    const input = defer({
      x: Promise.resolve("alpha"),
      y: Promise.resolve("beta"),
    });
    const promises = promisesOf(input as Record<string, unknown>);
    expect(await promises.x).toBe("alpha");
    expect(await promises.y).toBe("beta");
  });
});
