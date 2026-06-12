import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";
import { searchParamsToObject, validateSearch } from "../server/search.ts";
import { createServer } from "../server/serve.ts";

// ── Unit: searchParamsToObject ──────────────────────────────────────────────

describe("searchParamsToObject", () => {
  test("single values stay strings", () => {
    expect(searchParamsToObject(new URLSearchParams("a=1&b=x"))).toEqual({ a: "1", b: "x" });
  });

  test("repeated keys collapse into arrays", () => {
    expect(searchParamsToObject(new URLSearchParams("tag=a&tag=b&tag=c"))).toEqual({
      tag: ["a", "b", "c"],
    });
  });

  test("empty params → empty object", () => {
    expect(searchParamsToObject(new URLSearchParams(""))).toEqual({});
  });
});

// ── Unit: validateSearch ────────────────────────────────────────────────────

const coercingSchema = {
  safeParse(input: unknown) {
    const obj = input as Record<string, unknown>;
    const n = Number(obj.page ?? 1);
    if (!Number.isInteger(n)) {
      return { success: false, error: { issues: [{ path: ["page"], message: "not an int" }] } };
    }
    return { success: true, data: { page: n } };
  },
};

describe("validateSearch", () => {
  test("no schema → raw string record (back-compat)", async () => {
    const url = new URL("http://x.test/posts?page=2&tag=a&tag=b");
    expect(await validateSearch(undefined, url)).toEqual({ page: "2", tag: ["a", "b"] });
  });

  test("schema output replaces raw strings (coercion)", async () => {
    const url = new URL("http://x.test/posts?page=7");
    expect(await validateSearch(coercingSchema, url)).toEqual({ page: 7 });
  });

  test("schema failure throws a 400 Response with field errors", async () => {
    const url = new URL("http://x.test/posts?page=abc");
    try {
      await validateSearch(coercingSchema, url);
      expect.unreachable("validateSearch should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { errors: Record<string, string[]> };
      expect(body.errors.page).toEqual(["not an int"]);
    }
  });
});

// ── Integration: live server with a searchSchema route ─────────────────────

const PORT = 3996;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

let handle: ReturnType<typeof createServer>;

beforeAll(() => {
  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
});

afterAll(() => {
  handle.stop();
});

describe("searchSchema end-to-end", () => {
  test("/_data returns the validated+coerced search object and loaders receive it", async () => {
    const res = await fetch(`${BASE}/_data?path=${encodeURIComponent("/search-demo?page=3&tag=x")}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      search: Record<string, unknown>;
      route: { receivedSearch: Record<string, unknown> };
    };
    expect(data.search).toEqual({ page: 3, tag: ["x"] });
    expect(data.route.receivedSearch).toEqual({ page: 3, tag: ["x"] });
  });

  test("/_data applies schema defaults when params are absent", async () => {
    const res = await fetch(`${BASE}/_data?path=${encodeURIComponent("/search-demo")}`);
    const data = (await res.json()) as { search: Record<string, unknown> };
    expect(data.search).toEqual({ page: 1 });
  });

  test("/_data with invalid search → 400 with field errors, loader never runs", async () => {
    const res = await fetch(`${BASE}/_data?path=${encodeURIComponent("/search-demo?page=abc")}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: Record<string, string[]> };
    expect(body.errors.page).toBeDefined();
  });

  test("document GET with invalid search → 400", async () => {
    const res = await fetch(`${BASE}/search-demo?page=abc`);
    expect(res.status).toBe(400);
  });

  test("document GET hydrates the validated search into __BRACTJS_DATA__", async () => {
    const res = await fetch(`${BASE}/search-demo?page=5`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('"search":{"page":5}');
  });

  test("routes without a schema still get the raw string record", async () => {
    const res = await fetch(`${BASE}/_data?path=${encodeURIComponent("/?q=hello")}`);
    const data = (await res.json()) as { search: Record<string, unknown> };
    expect(data.search).toEqual({ q: "hello" });
  });
});
