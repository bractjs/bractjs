import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { reviveDeferred } from "../client/deferred-revive.ts";
import { getRequest } from "../server/request-context.ts";
import { createServer } from "../server/serve.ts";
import type { Deferred } from "../shared/deferred.ts";

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

// Regression: soft navigation reads `meta` from the /_data payload to update
// the document head — when the payload omitted it, every soft-nav wiped the
// title/description back to nothing.
test("GET /_data?path=/ includes the route's merged meta", async () => {
  const res = await fetch(`${BASE}/_data?path=/`);
  const data = (await res.json()) as { meta?: Array<Record<string, string>> };
  expect(Array.isArray(data.meta)).toBe(true);
  expect(data.meta).toContainEqual({ title: "BractJS Test Home" });
});

test("POST / runs action and returns 200 HTML", async () => {
  const form = new FormData();
  form.set("name", "bract");
  const res = await fetch(`${BASE}/`, { method: "POST", body: form, headers: { Origin: BASE } });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
});

// A client-side action submit (X-BractJS-Action) gets the redirect as a
// 204 + X-BractJS-Redirect envelope instead of a raw 3xx: fetch() would
// otherwise auto-follow into a throwaway document GET that consumes one-shot
// state (flash cookies) before the router's /_data request can read it.
test("POST action that RETURNS redirect() is enveloped for client submits (X-BractJS-Action)", async () => {
  const res = await fetch(`${BASE}/redirect-action`, {
    method: "POST",
    body: new FormData(),
    headers: { Origin: BASE, "X-BractJS-Action": "1" },
    redirect: "manual",
  });
  expect(res.status).toBe(204);
  expect(res.headers.get("X-BractJS-Redirect")).toBe("/");
  expect(res.headers.get("Location")).toBeNull();
  // The flash pattern: one-shot cookies attached to the redirect must survive.
  expect(res.headers.get("Set-Cookie")).toContain("flash=saved");
});

test("full-page POST action that RETURNS redirect() yields a real 3xx", async () => {
  const res = await fetch(`${BASE}/redirect-action`, {
    method: "POST",
    body: new FormData(),
    headers: { Origin: BASE },
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("Location")).toBe("/");
});

test("GET /nonexistent returns 404", async () => {
  const res = await fetch(`${BASE}/nonexistent`);
  expect(res.status).toBe(404);
});

// defineActions: dispatch on the form's `intent` field through one route action.
test("defineActions dispatches POST intent=add to the right handler", async () => {
  const form = new FormData();
  form.set("intent", "add");
  form.set("title", "Buy milk");
  const res = await fetch(`${BASE}/intent-demo`, {
    method: "POST",
    body: form,
    headers: { Origin: BASE, "X-BractJS-Action": "1" },
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { ok?: boolean; title?: string };
  expect(data.ok).toBe(true);
  expect(data.title).toBe("Buy milk");
});

test("defineActions returns 400 for an unknown intent", async () => {
  const form = new FormData();
  form.set("intent", "bogus");
  const res = await fetch(`${BASE}/intent-demo`, {
    method: "POST",
    body: form,
    headers: { Origin: BASE, "X-BractJS-Action": "1" },
  });
  expect(res.status).toBe(400);
});

// Remix/React Router actions read the body themselves; the handler has already
// consumed it, so `request.formData()` must return the parsed copy.
test("route action can call request.formData() (Remix-style) after the framework parsed the body", async () => {
  const form = new FormData();
  form.set("title", "Ported from Remix");
  const res = await fetch(`${BASE}/request-formdata`, {
    method: "POST",
    body: form,
    headers: { Origin: BASE, "X-BractJS-Action": "1" },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    title: "Ported from Remix",
    sameAsArg: true,
    url: "/request-formdata",
    method: "POST",
    isRequest: true,
  });
});

// <Form intent="add"> renders the hidden input server-side (no DOM harness:
// assert on the SSR HTML directly).
test("<Form intent> renders the hidden intent input in SSR HTML", async () => {
  const res = await fetch(`${BASE}/intent-demo`);
  const html = await res.text();
  expect(html).toContain('name="intent"');
  expect(html).toContain('value="add"');
});

// A loader that throws is isolated into the route's __error slot (not a 500),
// so layout/root still render. (The dev-only `routeFile` field is covered as a
// unit in loader.test.ts; this server runs in prod mode.)
test("a throwing loader is captured in the route slot's __error", async () => {
  const res = await fetch(`${BASE}/_data?path=/boom`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { route: { __error?: { message: string } } };
  expect(data.route.__error).toBeDefined();
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

// Regression: a redirect THROWN from a loader (the requireAdmin/auth-gate
// pattern) must come back from /_data as a real 3xx, not a 500. The /_data
// handler wraps loaders in `return await runRouteMiddleware(...)`; a bare
// `return` would let the rejection escape its try/catch (which handles
// isRedirect) to the top-level handler, which logs "unhandled request error"
// and returns 500 — breaking soft-nav redirects for gated routes.
test("full-page GET of a loader that throws redirect returns the 3xx", async () => {
  const res = await fetch(`${BASE}/redirect-loader`, { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

test("/_data of a loader that throws redirect answers the 204 envelope (not a 3xx, not 500)", async () => {
  // fetch() would follow a raw 3xx to the /login *document* — a 200 HTML body
  // the client router cannot parse as JSON. The envelope lets it soft-navigate.
  const res = await fetch(`${BASE}/_data?path=/redirect-loader`, { redirect: "manual" });
  expect(res.status).toBe(204);
  expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
  expect(res.headers.get("location")).toBeNull();
});

test("/_data of a route whose beforeLoad RETURNS redirect() answers the 204 envelope too", async () => {
  const res = await fetch(`${BASE}/_data?path=/redirect-beforeload-return`, { redirect: "manual" });
  expect(res.status).toBe(204);
  expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
  const doc = await fetch(`${BASE}/redirect-beforeload-return`, { redirect: "manual" });
  expect(doc.status).toBe(302);
  expect(doc.headers.get("location")).toBe("/login");
});

test("a client Form submit whose middleware throws redirect() gets the action envelope", async () => {
  const res = await fetch(`${BASE}/redirect-beforeload-throw`, {
    method: "POST",
    headers: { "X-BractJS-Action": "1", Origin: BASE },
    body: new FormData(),
    redirect: "manual",
  });
  expect(res.status).toBe(204);
  expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
});

test("a document load of a route whose beforeLoad throws redirect() gets the 3xx (not 500)", async () => {
  const res = await fetch(`${BASE}/redirect-beforeload-throw`, { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

test("a document load of a route whose middleware throws HttpError renders the error document with its status", async () => {
  const res = await fetch(`${BASE}/forbidden-middleware`);
  expect(res.status).toBe(403);
  expect(res.headers.get("content-type")).toContain("text/html");
});

// ── Route headers / useMatches / nested middleware (Phases 1, 2, 4) ──────────

test("route `headers` export sets Cache-Control on the document response", async () => {
  const res = await fetch(`${BASE}/features-demo`);
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("public, max-age=120");
  // Baseline hardening headers still present (not clobbered).
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
});

test("route `headers` export also applies to the /_data response", async () => {
  const res = await fetch(`${BASE}/_data?path=/features-demo`);
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("public, max-age=120");
  expect(res.headers.get("content-type")).toContain("application/json");
});

test("nested middleware runs (sets context read by the loader, stamps a header)", async () => {
  const res = await fetch(`${BASE}/_data?path=/features-demo`);
  expect(res.headers.get("X-Demo-Mw")).toBe("1");
  const data = (await res.json()) as { route?: { user?: string } };
  // The loader saw the context value the middleware set.
  expect(data.route?.user).toBe("alice");
});

test("/_data payload carries the matched chain (useMatches) with handle", async () => {
  const res = await fetch(`${BASE}/_data?path=/features-demo`);
  const data = (await res.json()) as { matches?: Array<{ id: string; handle?: { breadcrumb?: string } }> };
  expect(Array.isArray(data.matches)).toBe(true);
  // Leaf route carries its handle export.
  const leaf = data.matches!.at(-1)!;
  expect(leaf.handle?.breadcrumb).toBe("Features");
});

// Compression is applied by createServer around the whole handler (outside the
// global pipeline). Bun's fetch decompresses transparently, so opt out of that
// to see the wire bytes.
test("createServer compresses SSR documents when the client accepts it", async () => {
  const res = await fetch(`${BASE}/`, { headers: { "Accept-Encoding": "br" }, decompress: false });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-encoding")).toBe("br");
  expect(res.headers.get("vary")).toContain("Accept-Encoding");
  const html = brotliDecompressSync(new Uint8Array(await res.arrayBuffer())).toString();
  expect(html).toContain("<html");
});

test("createServer({ compression: false }) sends identity responses", async () => {
  const plain = createServer({
    port: 3981,
    appDir: FIXTURE_APP,
    compression: false,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
  try {
    const res = await fetch("http://localhost:3981/", {
      headers: { "Accept-Encoding": "br" },
      decompress: false,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toContain("<html");
  } finally {
    plain.stop();
  }
});

// defer(): the document's data island carries a marker, the value follows the
// HTML stream in a trailing script, and the client revives it — replayed here
// the way the browser runs it. Previously the island held `{"promise":{}}` and
// <Await> crashed hydration (React error #438).
test("defer() round-trips through the SSR document", async () => {
  const html = await (await fetch(`${BASE}/deferred`)).text();
  expect(html).toMatch(/items: (<!-- -->)?a,b/); // server-rendered through <Await>
  const island = /window\.__BRACTJS_DATA__=(\{[\s\S]*?\});/.exec(html)?.[1];
  const trailing = /<script[^>]*>(\(function\(r\)[\s\S]*?)<\/script>$/.exec(html)?.[1];
  expect(island).toBeDefined();
  expect(trailing).toBeDefined();
  const g = globalThis as { __BRACTJS_DEFERRED__?: unknown; __BRACTJS_RESOLVE__?: unknown };
  try {
    new Function("self", trailing as string)(globalThis);
    const data = JSON.parse(island as string) as { loaderData: Record<string, unknown> };
    const { route } = reviveDeferred(data.loaderData) as { route: { fast: string; slow: Deferred<unknown> } };
    expect(route.fast).toBe("shell-ready");
    expect(await route.slow.promise).toEqual({ items: ["a", "b"] });
  } finally {
    delete g.__BRACTJS_DEFERRED__;
    delete g.__BRACTJS_RESOLVE__;
  }
});

test("defer() values are settled and inlined in /_data", async () => {
  const ok = (await (await fetch(`${BASE}/_data?path=/deferred`)).json()) as {
    route: Record<string, unknown>;
  };
  expect(ok.route.slow).toEqual({ __bractDeferred: { ok: true, value: { items: ["a", "b"] } } });
  const failed = (await (
    await fetch(`${BASE}/_data?path=${encodeURIComponent("/deferred?fail")}`)
  ).json()) as {
    route: Record<string, unknown>;
  };
  expect(failed.route.slow).toEqual({
    __bractDeferred: { ok: false, error: { message: "slow-thing-missing", status: 404 } },
  });
});

// Server actions receive only the caller's arguments; getRequest() is how they
// see the session cookie to authorize themselves.
test("getRequest() inside a server action returns the incoming request", async () => {
  const raw = new TextEncoder().encode("lib/whoami.server.ts#whoami");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const id = Array.from(digest, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  const res = await fetch(`${BASE}/_action?id=${id}`, {
    method: "POST",
    headers: {
      Origin: BASE,
      "X-BractJS-Action": "1",
      "Content-Type": "application/json",
      Cookie: "session=abc123",
    },
    body: JSON.stringify(["hello"]),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ label: "hello", cookie: "session=abc123" });
});

test("getRequest() outside a request throws a clear error", () => {
  expect(() => getRequest()).toThrow(/outside a request/);
});

// A route loader's HttpError renders the route's ErrorBoundary with that status
// (previously: a raw JSON body on document loads, and a dead click on soft nav).
test("route-loader HttpError renders the route's ErrorBoundary with its status", async () => {
  const res = await fetch(`${BASE}/missing`);
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toMatch(/<p id="route-boundary">404(<!-- -->)?: (<!-- -->)?No such widget<\/p>/);
  expect(html).not.toContain("unreachable");
});

test("without an ErrorBoundary the built-in fallback renders", async () => {
  const res = await fetch(`${BASE}/missing-bare`);
  expect(res.status).toBe(410);
  const html = await res.text();
  expect(html).toContain('data-bract-error="410"');
  expect(html).toContain("Gone for good");
});

test("an unexpected route-loader error renders the fallback with a 500", async () => {
  const res = await fetch(`${BASE}/boom`);
  expect(res.status).toBe(500);
  const html = await res.text();
  expect(html).toContain('data-bract-error="500"');
  expect(html).not.toContain("unreachable");
  expect(html).not.toContain("kaboom"); // production: message sanitized
});

test("/_data carries the route-loader HttpError so client navigation can render it", async () => {
  const res = await fetch(`${BASE}/_data?path=/missing`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { route: unknown };
  expect(data.route).toEqual({ __error: { message: "No such widget", status: 404 } });
});

// Intermediate layout.tsx components render around their routes (they used to
// be skipped entirely — only root → route rendered), each reading its own data.
test("layout.tsx wraps its routes and reads its own loader data", async () => {
  const html = await (await fetch(`${BASE}/nested`)).text();
  expect(html).toMatch(
    /<section id="nested-layout"><h2>Nested section<\/h2>(<!--\$-->)?<p id="nested-route">Nested index<\/p>(<!--\/\$-->)?<\/section>/,
  );
});

test("a guard-only layout.ts stays transparent between rendering levels", async () => {
  const html = await (await fetch(`${BASE}/nested/guarded/page`)).text();
  expect(html).toMatch(
    /<section id="nested-layout"><h2>Nested section<\/h2>(<!--\$-->)?<p id="guarded-route">Guarded page<\/p>(<!--\/\$-->)?<\/section>/,
  );
  const data = (await (await fetch(`${BASE}/_data?path=/nested/guarded/page`)).json()) as {
    layouts: unknown[];
  };
  expect(data.layouts).toEqual([{ section: "Nested section" }, { guard: "passed" }]);
});
