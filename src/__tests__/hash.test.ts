import { test, expect } from "bun:test";
import { hashString } from "../build/hash.ts";

test("same content → same hash", async () => {
  const a = await hashString("hello world");
  const b = await hashString("hello world");
  expect(a).toBe(b);
});

test("different content → different hash", async () => {
  const a = await hashString("foo");
  const b = await hashString("bar");
  expect(a).not.toBe(b);
});

test("hash is 8 hex chars", async () => {
  const h = await hashString("bractjs");
  expect(h).toMatch(/^[0-9a-f]{8}$/);
});
