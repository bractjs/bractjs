import { test, expect, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";

const PORT = 3999;
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

test("GET / returns 200 HTML", async () => {
  const res = await fetch(`${BASE}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
});

test("GET /_data?path=/ returns JSON with route key", async () => {
  const res = await fetch(`${BASE}/_data?path=/`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as Record<string, unknown>;
  expect(data).toHaveProperty("route");
  expect(data).toHaveProperty("params");
});

test("POST / runs action and returns 200 HTML", async () => {
  const form = new FormData();
  form.set("name", "bract");
  const res = await fetch(`${BASE}/`, { method: "POST", body: form });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
});

test("GET /nonexistent returns 404", async () => {
  const res = await fetch(`${BASE}/nonexistent`);
  expect(res.status).toBe(404);
});

test("HTML includes window.__BRACTJS_DATA__", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  expect(html).toContain("__BRACTJS_DATA__");
});

test("HTML includes loader data from route", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  expect(html).toContain("hello from bractjs");
});

test("HTML includes <title> from meta()", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  expect(html).toContain("BractJS Test Home");
});
