// Regression tests for the October 2026 security / correctness scan.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileMdxRoutes, exportsOwnMeta, splitFrontmatter } from "../codegen/mdx.ts";
import { editorArgs } from "../dev/overlay-endpoints.ts";
import { setInMemory } from "../image/cache.ts";
import { handleImageRequest } from "../image/handler.ts";
import { FIT_DEFAULT, FORMAT_DEFAULT, QUALITY_DEFAULT } from "../image/types.ts";
import { cors } from "../middleware/cors.ts";
import { clearApiRoutes, route } from "../server/api-route.ts";
import { getClientAddress } from "../server/client-address.ts";
import { csp } from "../server/csp.ts";
import { createIsr } from "../server/isr.ts";
import { createMiddlewareContext, pipeline } from "../server/middleware.ts";
import { buildFetchHandler } from "../server/serve.ts";
import { createCookieSession } from "../server/session.ts";
import { renderSitemap } from "../server/sitemap.ts";
import { clearWebSocketEndpoints, registerUpgrader, websocket } from "../server/websocket.ts";

const TMP = resolve(import.meta.dir, ".tmp-scan-2026-10");
const SRC = resolve(import.meta.dir, "..");
const MANIFEST = { clientEntry: "/c.js", routes: {} };

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
});
afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

const actionId = async (relPath: string, name: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${relPath}#${name}`))),
    (b) => b.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 16);

// ── #1 navigation targets ──────────────────────────────────────────────────

describe("off-origin navigation never runs a script URL", () => {
  const g = globalThis as { window?: unknown };
  let assigned: string[] = [];
  beforeAll(() => {
    g.window = {
      location: {
        href: "https://app.example/page",
        origin: "https://app.example",
        assign: (to: string) => assigned.push(to),
        replace: (to: string) => assigned.push(`replace:${to}`),
      },
    };
  });
  afterEach(() => {
    assigned = [];
  });
  afterAll(() => {
    delete g.window;
  });

  test("assignExternal follows http(s), mailto and tel only", async () => {
    const { assignExternal } = await import("../client/nav-utils.ts");
    for (const ok of ["https://other.example/", "mailto:a@b.example", "tel:+15551234"]) assignExternal(ok);
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>x</script>"]) {
      assignExternal(bad);
    }
    expect(assigned).toEqual(["https://other.example/", "mailto:a@b.example", "tel:+15551234"]);
  });

  test("softNavigate without a router refuses a javascript: URL", async () => {
    const { registerNavigator, softNavigate } = await import("../client/revalidation.ts");
    registerNavigator(null);
    await softNavigate("javascript:alert(1)");
    await softNavigate("/posts");
    expect(assigned).toEqual(["/posts"]);
  });
});

// ── #2 X-Forwarded-For ────────────────────────────────────────────────────

describe("getClientAddress behind proxies", () => {
  const req = (xff?: string, realIp?: string) =>
    new Request("http://x/", {
      headers: { ...(xff ? { "X-Forwarded-For": xff } : {}), ...(realIp ? { "X-Real-IP": realIp } : {}) },
    });

  test("trustProxy: true takes the entry the proxy appended, not the client's", () => {
    // The client sent "6.6.6.6"; the proxy appended the real address.
    expect(getClientAddress(req("6.6.6.6, 203.0.113.7"), { trustProxy: true })).toBe("203.0.113.7");
    expect(getClientAddress(req("203.0.113.7"), { trustProxy: true })).toBe("203.0.113.7");
  });

  test("trustProxy: n trusts n proxies", () => {
    expect(getClientAddress(req("6.6.6.6, 203.0.113.7, 10.0.0.2"), { trustProxy: 2 })).toBe("203.0.113.7");
    // Fewer entries than proxies: fall back to X-Real-IP, never a client-chosen entry.
    expect(getClientAddress(req("203.0.113.7", "198.51.100.1"), { trustProxy: 2 })).toBe("198.51.100.1");
    expect(getClientAddress(req("203.0.113.7"), { trustProxy: 2 })).toBeUndefined();
  });
});

// ── #3 the global context reaches endpoint middleware ───────────────────────

describe("global middleware's context reaches /api, /_action and WebSocket middleware", () => {
  const APP = resolve(TMP, "ctx-app");
  beforeAll(async () => {
    await mkdir(resolve(APP, "routes/admin"), { recursive: true });
    await writeFile(
      resolve(APP, "root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
    );
    await writeFile(
      resolve(APP, "routes/admin/layout.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export const middleware = [({ context }, next) => (context.user === "ada" ? next() : new Response("no user", { status: 403 }))];
export default function L() { return <Outlet />; }
`,
    );
    await writeFile(
      resolve(APP, "routes/admin/actions.ts"),
      `"use server";\nexport async function save() { return "saved"; }\n`,
    );
    await mkdir(resolve(APP, "lib"), { recursive: true });
    await writeFile(
      resolve(APP, "lib/reexport.server.ts"),
      `"use server";\nexport { save } from "../routes/admin/actions.ts";\n`,
    );
  });
  afterEach(() => {
    pipeline.clear();
    clearApiRoutes();
    clearWebSocketEndpoints();
  });

  const userFromHeader = () =>
    pipeline.use(async ({ request, context }, next) => {
      const user = request.headers.get("X-User");
      if (user) context.user = user;
      return next();
    });
  const needsUser = async (
    { context }: { context: Record<string, unknown> },
    next: () => Promise<Response>,
  ) => (context.user === "ada" ? next() : new Response("no user", { status: 403 }));

  test("a route action's layout middleware sees the user", async () => {
    userFromHeader();
    const handler = buildFetchHandler({ appDir: APP, manifest: MANIFEST });
    const call = (headers: Record<string, string>) =>
      actionId("routes/admin/actions.ts", "save").then((id) =>
        handler(
          new Request(`http://localhost/_action?id=${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-BractJS-Action": "1", ...headers },
            body: "[]",
          }),
        ),
      );
    expect((await call({ "X-User": "ada" })).status).toBe(200);
    expect((await call({})).status).toBe(403);
  });

  test("#4: re-exporting an action doesn't drop the original module's guard", async () => {
    const handler = buildFetchHandler({ appDir: APP, manifest: MANIFEST });
    const res = await handler(
      new Request(`http://localhost/_action?id=${await actionId("lib/reexport.server.ts", "save")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
        body: "[]",
      }),
    );
    expect(res.status).toBe(403);
  });

  test("an /api endpoint's middleware sees the user", async () => {
    userFromHeader();
    route("GET", "/api/me", (_input, _req, ctx) => ({ user: ctx.context.user }), { middleware: [needsUser] });
    const handler = buildFetchHandler({ appDir: APP, manifest: MANIFEST });
    const res = await handler(new Request("http://localhost/api/me", { headers: { "X-User": "ada" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "ada" });
  });

  test("a WebSocket endpoint's middleware sees the user", async () => {
    userFromHeader();
    websocket("/ws", {}, { middleware: [needsUser] });
    const handler = buildFetchHandler({ appDir: APP, manifest: MANIFEST });
    const req = new Request("http://localhost/ws", { headers: { Upgrade: "websocket", "X-User": "ada" } });
    registerUpgrader(req, () => true);
    expect((await handler(req)).headers.get("X-BractJS-WebSocket")).toBe("upgraded");
  });
});

// ── #6 image cache key ─────────────────────────────────────────────────────

describe("/_image caches by file, not by URL spelling", () => {
  test("/public/./a.png and /public//a.png hit the cache entry for /public/a.png", async () => {
    const pub = resolve(TMP, "img-public");
    await mkdir(pub, { recursive: true });
    await writeFile(resolve(pub, "a.png"), "not really a png");
    const params = { w: 320, h: undefined, q: QUALITY_DEFAULT, format: FORMAT_DEFAULT, fit: FIT_DEFAULT };
    await setInMemory("/public/a.png", params, {
      data: new TextEncoder().encode("cached").buffer as ArrayBuffer,
      contentType: "image/webp",
      format: "webp",
    });
    for (const src of ["/public/./a.png", "/public//a.png", "/public/a.png"]) {
      const res = await handleImageRequest(
        new Request(`http://x/_image?src=${src}&w=320`),
        pub,
        resolve(TMP, "c"),
      );
      expect(res?.headers.get("X-Image-Cache")).toBe("MEM");
    }
  });

  test("an inherited key isn't a format", async () => {
    const res = await handleImageRequest(
      new Request("http://x/_image?src=/public/a.png&w=320&format=constructor"),
      resolve(TMP, "img-public"),
      resolve(TMP, "c"),
    );
    expect(res?.status).toBe(400);
  });
});

// ── #7 / #9 ISR ───────────────────────────────────────────────────────────

describe("ISR", () => {
  test("a failed regeneration backs off for a full interval", async () => {
    let clock = 1_000_000;
    let renders = 0;
    const isr = createIsr({
      now: () => clock,
      load: async (rel) =>
        rel === "_isr.json" ? JSON.stringify({ generatedAt: 0, routes: { "/news": 60 } }) : "<p>old</p>",
      render: async () => {
        renders++;
        return { html: new Response("down", { status: 503 }), data: new Response("down", { status: 503 }) };
      },
    });
    await isr.serve("/news", "html"); // stale → first attempt
    await Bun.sleep(0);
    await isr.serve("/news", "html");
    await isr.serve("/news", "html");
    await Bun.sleep(0);
    expect(renders).toBe(1);
    clock += 61_000;
    await isr.serve("/news", "html");
    await Bun.sleep(0);
    expect(renders).toBe(2);
  });

  test("ISR pages carry the baseline security headers", async () => {
    const isr = createIsr({
      load: async (rel) =>
        rel === "_isr.json" ? JSON.stringify({ generatedAt: Date.now(), routes: { "/": 60 } }) : "<p>x</p>",
      render: async () => ({ html: new Response("x"), data: new Response("{}") }),
    });
    const res = await isr.serve("/", "html");
    expect(res?.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res?.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

// ── #8 /_stream redirect ──────────────────────────────────────────────────

test("#8: a /_stream redirect navigates instead of failing", async () => {
  const { sseStream } = await import("../client/hooks/useFetcher.ts");
  const { registerNavigator } = await import("../client/revalidation.ts");
  const g = globalThis as { window?: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  g.window = { location: { href: "https://app.example/", origin: "https://app.example", assign() {} } };
  g.fetch = (async () =>
    new Response(null, {
      status: 204,
      headers: { "X-BractJS-Redirect": "/login" },
    })) as unknown as typeof fetch;
  const went: string[] = [];
  registerNavigator(async (to) => {
    went.push(to);
  });
  try {
    const values: unknown[] = [];
    for await (const v of sseStream("0123456789abcdef")) values.push(v);
    expect(values).toEqual([]);
    expect(went).toEqual(["/login"]);
  } finally {
    registerNavigator(null);
    g.fetch = realFetch;
    delete g.window;
  }
});

// ── #10 / #15 MDX ─────────────────────────────────────────────────────────

describe("MDX codegen", () => {
  const APP = resolve(TMP, "mdx-app");
  beforeAll(async () => {
    await mkdir(resolve(APP, "routes"), { recursive: true });
    await writeFile(resolve(APP, "routes/good.mdx"), "# Good\n");
    await writeFile(resolve(APP, "routes/broken.mdx"), "# Broken\n\n<Unclosed>\n");
  });

  test("one broken file doesn't stop the others; all failures are reported", async () => {
    await expect(compileMdxRoutes(APP)).rejects.toThrow("routes/broken.mdx");
    expect(existsSync(resolve(APP, "routes/good.mdx.tsx"))).toBe(true);
    await rm(resolve(APP, "routes/broken.mdx"));
  });

  test("an unchanged recompile refreshes the mtime, so it isn't recompiled again", async () => {
    const out = resolve(APP, "routes/good.mdx.tsx");
    // Simulate a touched source (git checkout, an edited mdx-components).
    const past = new Date(Date.now() - 60_000);
    await utimes(out, past, past);
    await compileMdxRoutes(APP); // recompiles: same content
    expect(statSync(out).mtimeMs).toBeGreaterThan(past.getTime() + 30_000);
    expect((await compileMdxRoutes(APP)).written).toEqual([]);
  });

  test("meta detection ignores code fences and sees export lists", () => {
    expect(exportsOwnMeta("```js\nexport const meta = 1;\n```\n")).toBe(false);
    expect(exportsOwnMeta("export const meta = () => [];")).toBe(true);
    expect(exportsOwnMeta("export { meta } from './m.ts';")).toBe(true);
  });

  test("empty frontmatter is frontmatter, not two rules", () => {
    expect(splitFrontmatter("---\n---\n# Hi\n", "x.mdx")).toEqual({ data: {}, body: "\n\n# Hi\n" });
  });
});

// ── #11 / #13 / #15 small fixes ───────────────────────────────────────────

test("#11: sitemap changefreq from extra() is XML-escaped", () => {
  const xml = renderSitemap("https://x.example", [
    { path: "/a", changefreq: "</changefreq><script>alert(1)</script>" as never, priority: "x" as never },
  ]);
  expect(xml).not.toContain("<script>");
  expect(xml).toContain("&lt;/changefreq&gt;&lt;script&gt;");
  expect(xml).not.toContain("<priority>");
});

test("#13: cors() and csp() work on a response with immutable headers", async () => {
  const immutable = () => Response.redirect("http://x/next", 302);
  const ctx = () => createMiddlewareContext(new Request("http://x/", { headers: { Origin: "http://x" } }));
  const corsRes = (await cors({ origin: "http://x" })(ctx(), async () => immutable())) as Response;
  expect(corsRes.headers.get("Access-Control-Allow-Origin")).toBe("http://x");
  const cspRes = (await csp()(ctx(), async () => immutable())) as Response;
  expect(cspRes.headers.get("Content-Security-Policy")).toContain("script-src");
  expect(cspRes.status).toBe(302);
});

test("#15: EDITOR with flags is split into argv", () => {
  expect(editorArgs("code --wait", "/p/a.ts", 4, 2)).toEqual(["code", "--wait", "-g", "/p/a.ts:4:2"]);
});

// ── Signed cookie-session expiry ──────────────────────────────────────────

describe("cookie sessions expire server-side", () => {
  const storage = createCookieSession({ name: "s", secrets: ["x".repeat(32)], maxAge: 60 });
  const header = (setCookie: string) => setCookie.split(";")[0];

  test("a cookie past its maxAge reads as an empty session, whatever the browser kept", async () => {
    const session = await storage.getSession(null);
    session.set("user", "ada");
    const cookie = header(await storage.commitSession(session));
    expect((await storage.getSession(cookie)).get("user")).toBe("ada");
    expect((await storage.getSession(cookie)).data).toEqual({ user: "ada" }); // the expiry stays internal
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      expect((await storage.getSession(cookie)).get("user")).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  test("a cookie issued before expiries were signed still reads", async () => {
    const legacy = createCookieSession({ name: "s", secrets: ["x".repeat(32)] }); // no maxAge → no expiry
    const session = await legacy.getSession(null);
    session.set("user", "ada");
    const cookie = header(await legacy.commitSession(session));
    expect((await storage.getSession(cookie)).get("user")).toBe("ada");
  });
});
