import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { handleApiRequest, route } from "../server/api-route.ts";
import { csp } from "../server/csp.ts";
import { pipeline } from "../server/middleware.ts";
import { hasForbiddenKey, nullProtoFromEntries } from "../server/proto-guard.ts";
import { searchParamsToObject } from "../server/search.ts";
import { createServer } from "../server/serve.ts";
import { validate } from "../server/validate.ts";

const PORT = 3989;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

// A marker middleware on the GLOBAL pipeline + a CSP middleware, plus a couple
// of API routes. Registered before the server starts; cleared afterwards so
// these don't leak into other suites sharing the process.
const MARKER = "X-Test-Global-MW";

let handle: ReturnType<typeof createServer>;

beforeAll(() => {
  pipeline.clear();
  pipeline.use(async (_ctx, next) => {
    const res = await next();
    res.headers.set(MARKER, "1");
    return res;
  });
  pipeline.use(csp());

  // Protected-by-default mutating route, an opted-out one, and a GET.
  route("POST", "/api/secure", (input: unknown) => ({ ok: true, input }));
  route("POST", "/api/public", (input: unknown) => ({ ok: true, input }), { csrf: false });
  route("GET", "/api/ping", () => ({ pong: true }));

  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
});

afterAll(() => {
  handle.stop();
  pipeline.clear();
});

// ── H-1 — global middleware now wraps the special endpoints ────────────────

describe("H-1: global middleware covers special endpoints", () => {
  test("marker + CSP applied to an /api response", async () => {
    const res = await fetch(`${BASE}/api/ping`);
    expect(res.headers.get(MARKER)).toBe("1");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  test("marker applied to /_action (even on 404 unknown id)", async () => {
    const res = await fetch(`${BASE}/_action?id=deadbeefdeadbeef`, {
      method: "POST",
      headers: { "X-BractJS-Action": "1", "Content-Type": "application/json" },
      body: "[]",
    });
    // unknown id → 404, but it still passed through the global pipeline.
    expect(res.headers.get(MARKER)).toBe("1");
  });

  test("marker applied to /_image (even on 400 bad request)", async () => {
    const res = await fetch(`${BASE}/_image?src=/etc/passwd`);
    expect(res.headers.get(MARKER)).toBe("1");
  });

  test("marker applied to a normal SSR document too (no double-run)", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.headers.get(MARKER)).toBe("1");
    // CSP header present exactly once.
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src");
  });
});

// ── H-2 — CSRF on typed /api routes ────────────────────────────────────────

describe("H-2: /api CSRF protection", () => {
  test("cross-site POST to a protected route → 403", async () => {
    const res = await fetch(`${BASE}/api/secure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(403);
  });

  test("no-attribution POST (no Origin / no header / no Sec-Fetch-Site) → 403", async () => {
    // Call the handler directly so no Origin is auto-added by fetch.
    const req = new Request("http://localhost/api/secure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    const res = await handleApiRequest(req);
    expect(res?.status).toBe(403);
  });

  test("same-origin POST (X-BractJS-Action) to a protected route → 200", async () => {
    const res = await fetch(`${BASE}/api/secure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, input: { a: 1 } });
  });

  test("same-origin POST via Sec-Fetch-Site → 200 (no custom header needed)", async () => {
    const res = await fetch(`${BASE}/api/secure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ a: 2 }),
    });
    expect(res.status).toBe(200);
  });

  test("opted-out route (csrf:false) allows cross-site POST", async () => {
    const res = await fetch(`${BASE}/api/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ a: 3 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, input: { a: 3 } });
  });

  test("GET /api is never CSRF-gated", async () => {
    const res = await fetch(`${BASE}/api/ping`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    expect(res.status).toBe(200);
  });

  test("forbidden-key JSON body to an /api route → 400", async () => {
    const res = await fetch(`${BASE}/api/secure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: '{"__proto__":{"polluted":true}}',
    });
    expect(res.status).toBe(400);
    // And Object.prototype was not polluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ── M-1 — CSP form-action ──────────────────────────────────────────────────

describe("M-1: CSP defaults", () => {
  test("default policy includes form-action 'self'", async () => {
    const res = await fetch(`${BASE}/api/ping`);
    expect(res.headers.get("Content-Security-Policy")).toContain("form-action 'self'");
  });
});

// ── M-2 — prototype-pollution guards ───────────────────────────────────────

describe("M-2: proto-guard", () => {
  test("hasForbiddenKey detects buried __proto__", () => {
    let v: unknown = JSON.parse('{"__proto__":{"x":1}}');
    for (let i = 0; i < 5; i++) v = { a: v };
    expect(hasForbiddenKey(v)).toBe(true);
  });

  test("hasForbiddenKey passes a clean object", () => {
    expect(hasForbiddenKey({ a: { b: { c: 1 } } })).toBe(false);
  });

  test("hasForbiddenKey fails closed past the scan depth", () => {
    let v: unknown = { value: "x" };
    for (let i = 0; i < 250; i++) v = { a: v };
    expect(hasForbiddenKey(v)).toBe(true);
  });

  test("searchParamsToObject yields a null-prototype object", () => {
    const out = searchParamsToObject(new URLSearchParams("__proto__=evil&a=1"));
    expect(Object.getPrototypeOf(out)).toBeNull();
    // __proto__ lands as a real own key, not a prototype mutation.
    expect(out["__proto__"]).toBe("evil");
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
  });

  test("validate() over FormData with a __proto__ field does not pollute", async () => {
    const fd = new FormData();
    fd.set("__proto__", "evil");
    fd.set("name", "ok");
    // Identity schema — just returns what it gets.
    const schema = { parse: (x: unknown) => x };
    const out = (await validate(schema, fd)) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
    expect(out.name).toBe("ok");
  });

  test("nullProtoFromEntries builds a null-prototype object", () => {
    const out = nullProtoFromEntries([
      ["__proto__", 1],
      ["a", 2],
    ]);
    expect(Object.getPrototypeOf(out)).toBeNull();
    expect(out["a"]).toBe(2);
  });
});
