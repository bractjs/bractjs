// Regression tests for the 2026-10 top-level security/correctness scan.
// Each block names the finding it pins.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isSourceFile } from "../dev/overlay-endpoints.ts";
import { clearApiRoutes, handleApiRequest, route } from "../server/api-route.ts";
import { applyRouteHeaders, resolveHeaders } from "../server/headers.ts";
import { json, redirectEnvelope } from "../server/response.ts";
import { decodePathname, serveStatic } from "../server/static.ts";
import { HttpError } from "../shared/errors.ts";

const TMP = resolve(import.meta.dir, ".tmp-security-top-scan");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(TMP, "build", "client"), { recursive: true });
  await mkdir(join(TMP, "public", "sub dir"), { recursive: true });
  await writeFile(join(TMP, "public", "my file.png"), "png-bytes");
  await writeFile(join(TMP, "public", "sub dir", "ünï.txt"), "unicode");
  await writeFile(join(TMP, "secret.txt"), "shhh");
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("/api dispatcher return values", () => {
  beforeAll(() => {
    clearApiRoutes();
    route("GET", "/api/t/response", () => {
      const h = new Headers({ Location: "https://idp.example/authorize", "Set-Cookie": "state=abc; Path=/" });
      return new Response(null, { status: 302, headers: h });
    });
    route("GET", "/api/t/void", () => undefined);
    route("GET", "/api/t/http-error", () => {
      throw new HttpError(403, "nope");
    });
    route("GET", "/api/t/plain", () => ({ ok: true }));
  });
  afterAll(() => clearApiRoutes());

  test("a returned Response is passed through with status and headers (OAuth start)", async () => {
    const res = await handleApiRequest(new Request("http://x/api/t/response"));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("Location")).toBe("https://idp.example/authorize");
    expect(res?.headers.get("Set-Cookie")).toContain("state=abc");
  });

  test("a void handler answers null, not a 500", async () => {
    const res = await handleApiRequest(new Request("http://x/api/t/void"));
    expect(res?.status).toBe(200);
    expect(await res?.json()).toBeNull();
  });

  test("a thrown HttpError maps to its status", async () => {
    const res = await handleApiRequest(new Request("http://x/api/t/http-error"));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "nope" });
  });

  test("plain values are still JSON", async () => {
    const res = await handleApiRequest(new Request("http://x/api/t/plain"));
    expect(await res?.json()).toEqual({ ok: true });
  });
});

describe("headers(): Set-Cookie accumulates across the chain", () => {
  const chain = {
    root: {},
    layouts: [{ headers: () => ({ "Set-Cookie": "flash=; Max-Age=0; Path=/", "X-A": "layout" }) }],
    route: { headers: () => ({ "Set-Cookie": "pref=dark; Path=/", "X-A": "route" }) },
  };
  const results = { root: null, layouts: [null], route: null };

  test("both cookies survive; other keys still override", () => {
    const merged = resolveHeaders(chain as never, results as never, {}, new Request("http://x/"));
    expect(merged?.getSetCookie()).toEqual(["flash=; Max-Age=0; Path=/", "pref=dark; Path=/"]);
    expect(merged?.get("X-A")).toBe("route");
  });

  test("an identical cookie forwarded via parentHeaders is not duplicated", () => {
    const fwd = {
      root: { headers: () => ({ "Set-Cookie": "flash=; Max-Age=0; Path=/" }) },
      layouts: [],
      route: { headers: ({ parentHeaders }: { parentHeaders: Headers }) => new Headers(parentHeaders) },
    };
    const merged = resolveHeaders(
      fwd as never,
      { root: null, layouts: [], route: null } as never,
      {},
      new Request("http://x/"),
    );
    expect(merged?.getSetCookie()).toEqual(["flash=; Max-Age=0; Path=/"]);
  });

  test("applyRouteHeaders keeps a cookie the base response already set", () => {
    const base = new Headers({ "Set-Cookie": "session=1; Path=/" });
    const resolved = new Headers({ "Set-Cookie": "flash=; Max-Age=0; Path=/" });
    expect(applyRouteHeaders(base, resolved).getSetCookie()).toEqual([
      "session=1; Path=/",
      "flash=; Max-Age=0; Path=/",
    ]);
  });
});

describe("json() with a no-body status", () => {
  test("204 has a null body (Node/Deno throw on a 204 with content)", async () => {
    const res = json(null, { status: 204 });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
  test("other statuses keep their JSON body", async () => {
    expect(await json({ a: 1 }, { status: 201 }).json()).toEqual({ a: 1 });
  });
});

describe("serveStatic decodes the request pathname", () => {
  test("percent-encoded space and non-ASCII names are found", async () => {
    const a = await serveStatic("/public/my%20file.png", join(TMP, "build"), join(TMP, "public"));
    expect(a?.status).toBe(200);
    expect(await a?.text()).toBe("png-bytes");
    const b = await serveStatic(
      "/public/sub%20dir/%C3%BCn%C3%AF.txt",
      join(TMP, "build"),
      join(TMP, "public"),
    );
    expect(await b?.text()).toBe("unicode");
  });

  test("encoded traversal, malformed escapes and NUL are rejected", async () => {
    expect(
      await serveStatic("/public/%2e%2e/secret.txt", join(TMP, "build"), join(TMP, "public")),
    ).toBeNull();
    expect(await serveStatic("/public/..%2fsecret.txt", join(TMP, "build"), join(TMP, "public"))).toBeNull();
    expect(await serveStatic("/public/%zz", join(TMP, "build"), join(TMP, "public"))).toBeNull();
    expect(await serveStatic("/public/my%00file.png", join(TMP, "build"), join(TMP, "public"))).toBeNull();
    expect(decodePathname("/a%")).toBeNull();
    expect(decodePathname("/a%00")).toBeNull();
    expect(decodePathname("/..%5C..%5Cx")).toBeNull();
  });
});

describe("dev overlay: only source files are excerpted", () => {
  test("code and styles yes; .env, keys, databases, json no", () => {
    for (const ok of ["app/x.ts", "app/x.tsx", "a.js", "a.mjs", "a.cjs", "a.css", "a.mdx", "index.html"]) {
      expect(isSourceFile(ok)).toBe(true);
    }
    for (const no of [
      ".env",
      ".env.local",
      "app/.env.production",
      "key.pem",
      "cms.db",
      "data.sqlite",
      "config.json",
      "notes.txt",
    ]) {
      expect(isSourceFile(no)).toBe(false);
    }
  });
});

describe("redirectEnvelope", () => {
  test("keeps Set-Cookie and drops Location", () => {
    const res = redirectEnvelope(
      new Response(null, { status: 302, headers: { Location: "/login", "Set-Cookie": "a=1" } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
  });
});
