import { test, expect, describe } from "bun:test";
import { safeStringify, requireEnv } from "../server/env.ts";

describe("safeStringify", () => {
  test("serializes plain objects", () => {
    const out = safeStringify({ a: 1, b: "hello" });
    expect(JSON.parse(out)).toEqual({ a: 1, b: "hello" });
  });

  test("serializes arrays", () => {
    const out = safeStringify([1, 2, 3]);
    expect(JSON.parse(out)).toEqual([1, 2, 3]);
  });

  test("serializes null", () => {
    expect(safeStringify(null)).toBe("null");
  });

  test("escapes < to \\u003c (XSS safe in <script> tags)", () => {
    const out = safeStringify({ html: "<script>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
    expect(JSON.parse(out).html).toBe("<script>");
  });

  test("escapes > to \\u003e", () => {
    const out = safeStringify({ html: "</script>" });
    expect(out).not.toContain(">");
    expect(out).toContain("\\u003e");
  });

  test("escapes & to \\u0026", () => {
    const out = safeStringify({ val: "a&&b" });
    expect(out).not.toContain("&&");
    expect(out).toContain("\\u0026");
    expect(JSON.parse(out).val).toBe("a&&b");
  });

  test("handles circular references with [Circular] sentinel", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj;
    const out = safeStringify(obj);
    const parsed = JSON.parse(out) as { name: string; self: string };
    expect(parsed.name).toBe("root");
    expect(parsed.self).toBe("[Circular]");
  });

  // Regression: a SHARED (non-cyclic) reference must serialize normally. The
  // old WeakSet-of-everything approach flagged the second occurrence as
  // circular — which corrupted __BRACTJS_DATA__ whenever a loader echoed
  // `args.search` (also present at the payload's top level).
  test("shared references are not flagged as circular", () => {
    const shared = { page: 5 };
    const out = safeStringify({ a: shared, b: { inner: shared } });
    expect(JSON.parse(out)).toEqual({ a: { page: 5 }, b: { inner: { page: 5 } } });
  });

  test("deep cycles through arrays are still caught", () => {
    const arr: unknown[] = [];
    const obj = { arr };
    arr.push(obj);
    const parsed = JSON.parse(safeStringify(obj)) as { arr: string[] };
    expect(parsed.arr[0]).toBe("[Circular]");
  });

  test("handles nested objects", () => {
    const out = safeStringify({ a: { b: { c: 42 } } });
    expect(JSON.parse(out)).toEqual({ a: { b: { c: 42 } } });
  });
});

describe("requireEnv", () => {
  test("returns value when env var is set", () => {
    Bun.env.TEST_VAR_BRACTJS = "hello";
    expect(requireEnv("TEST_VAR_BRACTJS")).toBe("hello");
    delete Bun.env.TEST_VAR_BRACTJS;
  });

  test("throws when env var is missing", () => {
    delete Bun.env.DEFINITELY_NOT_SET_BRACTJS;
    expect(() => requireEnv("DEFINITELY_NOT_SET_BRACTJS")).toThrow(
      "Missing required environment variable: DEFINITELY_NOT_SET_BRACTJS",
    );
  });

  test("throws when env var is empty string", () => {
    Bun.env.EMPTY_VAR_BRACTJS = "";
    expect(() => requireEnv("EMPTY_VAR_BRACTJS")).toThrow();
    delete Bun.env.EMPTY_VAR_BRACTJS;
  });
});
