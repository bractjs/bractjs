import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { handleImageRequest } from "../image/handler.ts";
import { cors } from "../middleware/cors.ts";
import { handleActionRequest } from "../server/action-handler.ts";
import { loadServerActions } from "../server/action-registry.ts";
import { isAllowedMutation } from "../server/csrf.ts";
import { safeStringify } from "../server/env.ts";
import { type MiddlewareContext, MiddlewarePipeline } from "../server/middleware.ts";
import { createServer } from "../server/serve.ts";
import { createCookieSession } from "../server/session.ts";
import { serveStatic } from "../server/static.ts";

const ACTION_TMP = resolve(import.meta.dir, ".tmp-security-action");
let registeredActionId = "";

// Mirrors `pathKeyForAction` — action IDs hash the appDir-relative path so
// they stay consistent between the server registry and the client proxy.
function pathKey(absPath: string, appDir: string): string {
  const absAppDir = isAbsolute(appDir) ? appDir : resolve(appDir);
  const rel = relative(absAppDir, absPath);
  return rel.startsWith("..") ? absPath : rel;
}

async function computeId(absPath: string, name: string, appDir: string): Promise<string> {
  const raw = new TextEncoder().encode(pathKey(absPath, appDir) + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

let handle: ReturnType<typeof createServer>;

beforeAll(async () => {
  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });

  await rm(ACTION_TMP, { recursive: true, force: true });
  await mkdir(join(ACTION_TMP, "routes"), { recursive: true });
  const actionFile = join(ACTION_TMP, "routes", "_index.tsx");
  await writeFile(actionFile, `"use server";\nexport async function ping(...args) { return args; }\n`);
  await loadServerActions(ACTION_TMP);
  registeredActionId = await computeId(actionFile, "ping", ACTION_TMP);
});

afterAll(async () => {
  handle.stop();
  await rm(ACTION_TMP, { recursive: true, force: true });
});

// ── Item 1 — path traversal ───────────────────────────────────────────────

describe("path traversal", () => {
  test("GET /public/../package.json returns 404, not file contents", async () => {
    const res = await fetch(`${BASE}/public/../package.json`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("@bractjs/bractjs");
  });
});

// ── Item 2 — action arg validation ────────────────────────────────────────

describe("action-handler — arg validation", () => {
  test("non-array JSON body → 400", async () => {
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: JSON.stringify({ foo: "bar" }),
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("array with __proto__ key → 400", async () => {
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      // Use JSON.parse to actually inject __proto__ as an own key
      body: '[{"__proto__":{"polluted":true}}]',
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("array with constructor key → 400", async () => {
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: '[{"constructor":1}]',
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("nested __proto__ below the old depth-20 cap → 400 (scan reaches it)", async () => {
    // Build a raw JSON string so "__proto__" is an OWN key (an object literal
    // would set the prototype instead). Bury it 24 levels deep — past the old
    // depth-20 short-circuit that previously let it slip through.
    let body = '{"__proto__":{"polluted":true}}';
    for (let i = 0; i < 24; i++) body = `{"a":${body}}`;
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: `[${body}]`,
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("payload nested past MAX_SCAN_DEPTH → 400 (fails closed)", async () => {
    // Over-deep nesting with NO forbidden key must still be rejected: a
    // security scan that can't see the bottom must not pass it through.
    let body = '{"value":"x"}';
    for (let i = 0; i < 250; i++) body = `{"a":${body}}`;
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: `[${body}]`,
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("normal nested payload (within cap) still succeeds", async () => {
    // A legitimately nested object (no forbidden keys) must NOT be rejected.
    let obj: Record<string, unknown> = { value: "ok" };
    for (let i = 0; i < 30; i++) obj = { nested: obj };
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: JSON.stringify([obj]),
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(200);
  });

  test("JSON body > 1 MiB rejected with 413 (advertised via Content-Length)", async () => {
    const huge = "a".repeat(2 * 1024 * 1024);
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BractJS-Action": "1",
        "Content-Length": String(2 * 1024 * 1024 + 2),
      },
      body: `["${huge}"]`,
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(413);
  });

  test("JSON body > 1 MiB rejected with 413 even when Content-Length lies", async () => {
    const huge = "a".repeat(2 * 1024 * 1024);
    const req = new Request(`http://x/_action?id=${registeredActionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BractJS-Action": "1",
        "Content-Length": "10",
      },
      body: `["${huge}"]`,
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(413);
  });
});

// ── F2 — reserved route exports are not registered as actions ──────────────

describe("action-registry — reserved route exports", () => {
  const TMP = resolve(import.meta.dir, ".tmp-reserved-exports");

  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(join(TMP, "routes"), { recursive: true });
    await writeFile(
      join(TMP, "routes", "page.tsx"),
      `"use server";
export async function loader() { return { secret: "leaked" }; }
export async function action() { return "mutated"; }
export default function Page() { return null; }
export async function doThing() { return "ok"; }
`,
    );
    await loadServerActions(TMP);
  });

  afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("loader / action / default in a routes/ file are NOT resolvable as actions", async () => {
    const { resolveAction } = await import("../server/action-registry.ts");
    for (const name of ["loader", "action", "default"]) {
      const id = await computeId(join(TMP, "routes", "page.tsx"), name, TMP);
      expect(resolveAction(id)).toBeNull();
    }
  });

  test("a genuine named export in the same file IS resolvable", async () => {
    const { resolveAction } = await import("../server/action-registry.ts");
    const id = await computeId(join(TMP, "routes", "page.tsx"), "doThing", TMP);
    expect(resolveAction(id)).not.toBeNull();
  });
});

// ── Item 3 — CSRF ─────────────────────────────────────────────────────────

describe("CSRF — cross-origin mutation", () => {
  test("/_action without X-BractJS-Action and with cross-origin Origin → 403", async () => {
    const req = new Request("http://localhost/_action?id=abc", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: "[]",
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(403);
  });

  test("/_action with same-origin Origin → not 403 (404 unknown id)", async () => {
    const req = new Request("http://localhost/_action?id=abc", {
      method: "POST",
      headers: { Origin: "http://localhost", "Content-Type": "application/json" },
      body: "[]",
    });
    const res = await handleActionRequest(req);
    expect(res?.status).not.toBe(403);
  });

  test("route POST with mismatched Origin → 403", async () => {
    const res = await fetch(`${BASE}/`, {
      method: "POST",
      body: new FormData(),
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  test("403 body is terse in prod (no info disclosure)", async () => {
    // This server runs in prod mode (NODE_ENV unset) — the body must not
    // include the dev hint.
    const res = await fetch(`${BASE}/`, {
      method: "POST",
      body: new FormData(),
      headers: { Origin: "https://evil.example" },
    });
    expect(await res.text()).toBe("Forbidden");
  });

  test("csrfForbiddenResponse explains the fix in dev, stays terse in prod", async () => {
    const { csrfForbiddenResponse } = await import("../server/csrf.ts");
    const original = Bun.env.NODE_ENV;
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      Bun.env.NODE_ENV = "development";
      expect(await csrfForbiddenResponse().text()).toContain("X-BractJS-Action");

      Bun.env.NODE_ENV = "production";
      expect(await csrfForbiddenResponse().text()).toBe("Forbidden");
    } finally {
      if (original === undefined) delete Bun.env.NODE_ENV;
      else Bun.env.NODE_ENV = original;
      spy.mockRestore();
    }
  });
});

describe("CSRF — Sec-Fetch-Site (isAllowedMutation)", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://localhost/_action?id=abc", { method: "POST", headers });
  }

  test("Sec-Fetch-Site: cross-site is rejected even with a forged X-BractJS-Action header", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "cross-site", "X-BractJS-Action": "1" }))).toBe(false);
  });

  test("Sec-Fetch-Site: same-site is rejected even with a forged X-BractJS-Action header", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "same-site", "X-BractJS-Action": "1" }))).toBe(false);
  });

  test("Sec-Fetch-Site: cross-site is rejected even with a matching Origin", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "cross-site", Origin: "http://localhost" }))).toBe(
      false,
    );
  });

  test("Sec-Fetch-Site: same-origin with custom header is allowed", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "same-origin", "X-BractJS-Action": "1" }))).toBe(true);
  });

  test("Sec-Fetch-Site: none (direct navigation) with same-origin Origin is allowed", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "none", Origin: "http://localhost" }))).toBe(true);
  });

  test("no headers at all is rejected (non-browser client must opt in)", () => {
    expect(isAllowedMutation(req({}))).toBe(false);
  });

  test("same-origin Sec-Fetch-Site with no Origin and no custom header is allowed", () => {
    expect(isAllowedMutation(req({ "Sec-Fetch-Site": "same-origin" }))).toBe(true);
  });
});

describe("CSRF — behind a TLS-terminating reverse proxy", () => {
  // The app is reached over plain HTTP from the proxy, so request.url says
  // http://app.example.com while the browser truthfully says https://.
  function proxied(headers: Record<string, string>): Request {
    return new Request("http://app.example.com/posts", { method: "POST", headers });
  }

  test("no-JS form post is allowed when X-Forwarded-Proto explains the scheme", () => {
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "https://app.example.com",
          "X-Forwarded-Proto": "https",
        }),
      ),
    ).toBe(true);
  });

  test("a proxy chain's first X-Forwarded-Proto value wins", () => {
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "https://app.example.com",
          "X-Forwarded-Proto": "https, http",
        }),
      ),
    ).toBe(true);
  });

  test("X-Forwarded-Host is honored when the proxy rewrites the Host", () => {
    expect(
      isAllowedMutation(
        new Request("http://internal-9000.svc.local/posts", {
          method: "POST",
          headers: {
            "Sec-Fetch-Site": "same-origin",
            Origin: "https://app.example.com",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "app.example.com",
          },
        }),
      ),
    ).toBe(true);
  });

  test("scheme mismatch WITHOUT a forwarded header is still rejected", () => {
    expect(
      isAllowedMutation(proxied({ "Sec-Fetch-Site": "same-origin", Origin: "https://app.example.com" })),
    ).toBe(false);
  });

  test("forwarded headers never rescue a genuinely foreign Origin", () => {
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "https://evil.example",
          "X-Forwarded-Proto": "https",
          "X-Forwarded-Host": "app.example.com",
        }),
      ),
    ).toBe(false);
  });

  test("Sec-Fetch-Site: cross-site still vetoes before forwarded headers are read", () => {
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "cross-site",
          Origin: "https://app.example.com",
          "X-Forwarded-Proto": "https",
        }),
      ),
    ).toBe(false);
  });

  test("a junk X-Forwarded-Proto falls back to the real scheme", () => {
    // javascript: must not become a candidate origin, and the real http://
    // origin must still be compared.
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "http://app.example.com",
          "X-Forwarded-Proto": "javascript",
        }),
      ),
    ).toBe(true);
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "https://app.example.com",
          "X-Forwarded-Proto": "javascript",
        }),
      ),
    ).toBe(false);
  });

  test("a malformed X-Forwarded-Host does not throw and does not allow", () => {
    expect(
      isAllowedMutation(
        proxied({
          "Sec-Fetch-Site": "same-origin",
          Origin: "https://app.example.com",
          "X-Forwarded-Proto": "https",
          "X-Forwarded-Host": "a b c://%%%",
        }),
      ),
    ).toBe(false);
  });

  test("direct (unproxied) same-origin behavior is unchanged", () => {
    expect(
      isAllowedMutation(proxied({ "Sec-Fetch-Site": "same-origin", Origin: "http://app.example.com" })),
    ).toBe(true);
  });
});

// ── Item 5 — safeStringify ───────────────────────────────────────────────

describe("safeStringify", () => {
  test("escapes U+2028 / U+2029", () => {
    const ls = String.fromCharCode(0x2028);
    const ps = String.fromCharCode(0x2029);
    const out = safeStringify({ a: `x${ls}y${ps}z` });
    expect(out).not.toContain(ls);
    expect(out).not.toContain(ps);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  test("escapes < > &", () => {
    const out = safeStringify({ x: "<script>&" });
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
  });
});

// ── Item 6 — session ─────────────────────────────────────────────────────

describe("session — secret validation", () => {
  test("empty secrets throws", () => {
    expect(() => createCookieSession({ name: "s", secrets: [] })).toThrow();
  });

  test("short secret throws", () => {
    expect(() => createCookieSession({ name: "s", secrets: ["short"] })).toThrow();
  });

  test("valid secret roundtrips", async () => {
    const s = createCookieSession({ name: "s", secrets: ["a-secret-that-is-long-enough-1"] });
    const sess = await s.getSession(null);
    sess.set("k", "v");
    const cookie = await s.commitSession(sess);
    const rt = await s.getSession(cookie.split(";")[0]);
    expect(rt.get("k")).toBe("v");
  });

  test("tampered signature rejected", async () => {
    const s = createCookieSession({ name: "s", secrets: ["a-secret-that-is-long-enough-1"] });
    const sess = await s.getSession(null);
    sess.set("k", "v");
    const cookie = await s.commitSession(sess);
    const tampered = cookie.replace(/=([^;]+)/, (_, val) => `=${val.slice(0, -1)}X`);
    const rt = await s.getSession(tampered.split(";")[0]);
    expect(rt.has("k")).toBe(false);
  });
});

// ── Item 7 — CORS ────────────────────────────────────────────────────────

describe("cors middleware", () => {
  async function runOnce(mw: ReturnType<typeof cors>, req: Request): Promise<Response> {
    const ctx: MiddlewareContext = { request: req, params: {}, context: {} };
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    return pipeline.run(ctx, () => Promise.resolve(new Response("ok")));
  }

  test("wildcard never reflects Origin", async () => {
    const mw = cors({ origin: "*" });
    const res = await runOnce(mw, new Request("http://x/", { headers: { Origin: "https://evil.example" } }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("always emits Vary: Origin", async () => {
    const mw = cors({ origin: "https://ok.example" });
    const res = await runOnce(mw, new Request("http://x/", { headers: { Origin: "https://ok.example" } }));
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  test("credentials + wildcard throws at setup", () => {
    expect(() => cors({ origin: "*", credentials: true })).toThrow();
  });
});

// ── Item 8 — image dim validation ────────────────────────────────────────

describe("image handler — dim allowlist", () => {
  test("w=999 (not in allowlist) → 400", async () => {
    const res = await fetch(`${BASE}/_image?src=/public/a.jpg&w=999`);
    expect(res.status).toBe(400);
  });

  test("w=320 (in allowlist) → not 400 (404 because file missing)", async () => {
    const res = await fetch(`${BASE}/_image?src=/public/missing.jpg&w=320`);
    expect(res.status).toBe(404);
  });

  test("w=3840&h=3840 (area too large) → 400", async () => {
    const res = await fetch(`${BASE}/_image?src=/public/a.jpg&w=3840&h=3840`);
    expect(res.status).toBe(400);
  });
});

// ── Item 11 — HttpError → response ───────────────────────────────────────
// (Implicitly covered: integration.test.ts hits a route; this test exercises
// the conversion via a direct loader throw is awkward without fixtures. Skip
// here — the request-handler change is type-checked + reachable via redirect.)

// ── Open-redirect backstop covers beforeLoad / route-middleware returns ───
// sanitizeRedirect already guards redirects thrown/returned by loaders/actions;
// these pin that a redirect Response *returned* from beforeLoad (and, by the
// same code path, route middleware) is neutralized too — on BOTH the document
// and /_data branches — so a raw off-origin Location can't escape the gate.

describe("open-redirect backstop — beforeLoad-returned redirect", () => {
  test("document GET: raw off-origin redirect → 500, no Location", async () => {
    const res = await fetch(`${BASE}/redirect-beforeload-external`, { redirect: "manual" });
    expect(res.status).toBe(500);
    expect(res.headers.get("Location")).toBeNull();
  });

  test("/_data soft-nav: raw off-origin redirect → 500, no Location", async () => {
    const res = await fetch(`${BASE}/_data?path=/redirect-beforeload-external`, { redirect: "manual" });
    expect(res.status).toBe(500);
    expect(res.headers.get("Location")).toBeNull();
  });
});

// ── Item 12 — Content-Type branching for action ──────────────────────────

describe("action Content-Type branching", () => {
  test("JSON content-type does not require multipart formData", async () => {
    const res = await fetch(`${BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ name: "bract" }),
    });
    // The fixture's action accepts FormData; with JSON CT, request-handler
    // passes an empty FormData and the action returns. Should not 500 from
    // formData() throwing.
    expect([200, 302, 400, 404]).toContain(res.status);
  });
});

// ── Item 14 — meta is array in __BRACTJS_DATA__ ─────────────────────────

describe("render meta shape", () => {
  test("__BRACTJS_DATA__.meta is an array", async () => {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    const match = html.match(/window\.__BRACTJS_DATA__=({[\s\S]*?});/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]) as { meta: unknown };
    expect(Array.isArray(data.meta)).toBe(true);
  });
});

// ── Item 20 — middleware double-next ─────────────────────────────────────

describe("middleware — double next()", () => {
  test("calling next() twice rejects", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (_ctx, next) => {
      await next();
      return next(); // illegal
    });
    const ctx: MiddlewareContext = { request: new Request("http://x/"), params: {}, context: {} };
    await expect(pipeline.run(ctx, () => Promise.resolve(new Response("ok")))).rejects.toThrow(
      /more than once/,
    );
  });
});

// ── Symlink escape (static + image) ─────────────────────────────────────

describe("symlink escape — static", () => {
  let pub: string;
  let outside: string;
  let buildDir: string;

  beforeAll(async () => {
    const root = (await Bun.file(tmpdir()).exists()) ? tmpdir() : ".";
    pub = join(root, `bract-sym-pub-${Date.now()}`);
    outside = join(root, `bract-sym-out-${Date.now()}`);
    buildDir = join(root, `bract-sym-build-${Date.now()}`);
    await mkdir(pub, { recursive: true });
    await mkdir(outside, { recursive: true });
    await mkdir(join(buildDir, "client"), { recursive: true });
    await writeFile(join(outside, "secret.txt"), "PWNED");
    // Symlink inside /public/ that points outside the root.
    await symlink(join(outside, "secret.txt"), join(pub, "escape.txt"));
  });

  afterAll(async () => {
    await rm(pub, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await rm(buildDir, { recursive: true, force: true });
  });

  test("static refuses to serve a symlink whose target is outside publicDir", async () => {
    const res = await serveStatic("/public/escape.txt", buildDir, pub);
    expect(res).toBeNull();
  });

  test("image /_image refuses src that symlinks outside publicDir", async () => {
    const cacheDir = join(tmpdir(), `bract-sym-cache-${Date.now()}`);
    await mkdir(cacheDir, { recursive: true });
    const req = new Request(`http://x/_image?src=/public/escape.txt&w=320`);
    const res = await handleImageRequest(req, pub, cacheDir);
    expect(res?.status === 400 || res?.status === 404).toBe(true);
    await rm(cacheDir, { recursive: true, force: true });
  });
});
