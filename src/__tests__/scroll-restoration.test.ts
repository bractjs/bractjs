import { test, expect, describe } from "bun:test";
import {
  savePosition,
  serializePositions,
  deserializePositions,
  MAX_SCROLL_ENTRIES,
} from "../client/scroll-restoration.ts";

describe("savePosition", () => {
  test("stores and overwrites a key", () => {
    const map = new Map<string, number>();
    savePosition(map, "a", 100);
    savePosition(map, "a", 250);
    expect(map.get("a")).toBe(250);
    expect(map.size).toBe(1);
  });

  test("evicts the oldest entries past the cap", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 5; i++) savePosition(map, `k${i}`, i, 3);
    expect(map.size).toBe(3);
    expect(map.has("k0")).toBe(false);
    expect(map.has("k1")).toBe(false);
    expect(map.get("k4")).toBe(4);
  });

  test("re-saving refreshes LRU order", () => {
    const map = new Map<string, number>();
    savePosition(map, "a", 1, 2);
    savePosition(map, "b", 2, 2);
    savePosition(map, "a", 10, 2); // refresh "a" → "b" is now oldest
    savePosition(map, "c", 3, 2);
    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(10);
    expect(map.get("c")).toBe(3);
  });

  test("default cap is applied", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < MAX_SCROLL_ENTRIES + 10; i++) savePosition(map, `k${i}`, i);
    expect(map.size).toBe(MAX_SCROLL_ENTRIES);
  });
});

describe("serialize/deserialize", () => {
  test("roundtrips entries", () => {
    const map = new Map<string, number>([["a", 0], ["b", 1234.5]]);
    const restored = deserializePositions(serializePositions(map));
    expect(restored.get("a")).toBe(0);
    expect(restored.get("b")).toBe(1234.5);
    expect(restored.size).toBe(2);
  });

  test("null/malformed/foreign payloads yield an empty map", () => {
    expect(deserializePositions(null).size).toBe(0);
    expect(deserializePositions("not json{").size).toBe(0);
    expect(deserializePositions('"a string"').size).toBe(0);
    expect(deserializePositions("[1,2,3]").size).toBe(0);
  });

  test("non-numeric values are dropped", () => {
    const restored = deserializePositions('{"a": 10, "b": "nope", "c": null, "d": 1e999}');
    expect(restored.get("a")).toBe(10);
    expect(restored.size).toBe(1); // "d" is Infinity after JSON.parse → dropped
  });
});
