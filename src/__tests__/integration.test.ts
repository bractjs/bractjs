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
  const res = await fetch(`${BASE}/`, { method: "POST", body: form, headers: { Origin: BASE } });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
});

// Regression: an action that *returns* (not throws) a redirect must produce a
// real 3xx with the Location header — previously it was wrapped into a 200 JSON
// body, so `<Form>`/the browser never followed it.
test("POST action that RETURNS redirect() yields a 302 with Location (X-BractJS-Action)", async () => {
  const res = await fetch(`${BASE}/redirect-action`, {
    method: "POST",
    body: new FormData(),
    headers: { Origin: BASE, "X-BractJS-Action": "1" },
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("/");
});

test("full-page POST action that RETURNS redirect() also yields a 302", async () => {
  const res = await fetch(`${BASE}/redirect-action`, {
    method: "POST",
    body: new FormData(),
    headers: { Origin: BASE },
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("/");
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

test("SSR HTML renders a real <title> tag in the document (not just the data island)", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  // Strip the <script> data island so we assert on the rendered document head,
  // not the __BRACTJS_DATA__ JSON (which also contains the title text).
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
  expect(withoutScripts).toMatch(/<title>BractJS Test Home<\/title>/);
});

test("SSR HTML renders <meta name=description> and og:title from meta()", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
  expect(withoutScripts).toMatch(/<meta[^>]+name="description"[^>]+content="Bract test description"/);
  expect(withoutScripts).toMatch(/<meta[^>]+property="og:title"[^>]+content="Bract OG Title"/);
});

// ── /_data auth parity (S2) ─────────────────────────────────────────────────
// beforeLoad() is the documented contract point for auth. It MUST run for the
// /_data soft-nav JSON endpoint exactly as it does for a full-page GET, so a
// gated route cannot leak its loader data as JSON via /_data.

test("full-page GET of a beforeLoad-gated route is blocked (403)", async () => {
  const res = await fetch(`${BASE}/protected`);
  expect(res.status).toBe(403);
  const body = await res.text();
  expect(body).not.toContain("TOP-SECRET-LOADER-DATA");
});

test("/_data of a beforeLoad-gated route is blocked and never leaks loader data", async () => {
  const res = await fetch(`${BASE}/_data?path=/protected`);
  // Same gate as the full-page GET — beforeLoad short-circuits before loaders.
  expect(res.status).toBe(403);
  const body = await res.text();
  expect(body).not.toContain("TOP-SECRET-LOADER-DATA");
});
