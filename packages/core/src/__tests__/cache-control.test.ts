import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cache, cacheControl, mergeCacheControl, privateWhenSettingCookies } from "../server/cache.ts";
import { createTestApp } from "../testing-entry.ts";

describe("cache()", () => {
  test("builds a Cache-Control header", () => {
    expect(cache({ maxAge: 60, sMaxAge: "1h", staleWhileRevalidate: "1d" })).toEqual({
      "Cache-Control": "max-age=60, s-maxage=3600, stale-while-revalidate=86400",
    });
    expect(cacheControl({ public: true, maxAge: "30s", staleIfError: "5m", mustRevalidate: true })).toBe(
      "public, max-age=30, stale-if-error=300, must-revalidate",
    );
    expect(cacheControl({ maxAge: "365d", immutable: true })).toBe("max-age=31536000, immutable");
    expect(cacheControl({ private: true, noCache: true })).toBe("private, no-cache");
  });

  test("noStore wins over everything", () => {
    expect(cacheControl({ noStore: true, maxAge: 60, public: true })).toBe("no-store");
  });

  test("rejects contradictions and bad durations", () => {
    expect(() => cacheControl({ private: true, public: true })).toThrow("contradict");
    expect(() => cacheControl({ private: true, sMaxAge: 60 })).toThrow("no effect with `private`");
    expect(() => cacheControl({ maxAge: -1 })).toThrow("non-negative");
    expect(() => cacheControl({ maxAge: "1w" as never })).toThrow('"1w"');
    expect(() => cacheControl({})).toThrow("at least one option");
  });
});

describe("mergeCacheControl()", () => {
  test("the most restrictive value wins", () => {
    expect(mergeCacheControl("public, max-age=3600", "public, max-age=60")).toBe("public, max-age=60");
    expect(mergeCacheControl("public, max-age=3600, s-maxage=86400", "private, max-age=60")).toBe(
      "private, max-age=60",
    );
    expect(mergeCacheControl("max-age=60", "no-store")).toBe("no-store");
    expect(mergeCacheControl("max-age=60, immutable", "max-age=30")).toBe("max-age=30");
  });

  test("an age one value leaves out is dropped", () => {
    // The parent sets no s-maxage; a child's s-maxage can't make it CDN-cacheable longer.
    expect(mergeCacheControl("public, max-age=60", "public, max-age=60, s-maxage=3600")).toBe(
      "public, max-age=60",
    );
  });

  test("ignores empty values", () => {
    expect(mergeCacheControl(null, undefined, "", "max-age=10")).toBe("max-age=10");
    expect(mergeCacheControl(null)).toBe("");
  });
});

describe("privateWhenSettingCookies()", () => {
  const req = new Request("http://x/page");

  test("a cookie-setting response can't be stored by a shared cache", () => {
    const res = new Response("hi", {
      headers: { "Set-Cookie": "sid=1", "Cache-Control": "public, max-age=60, s-maxage=600" },
    });
    expect(privateWhenSettingCookies(res, req).headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  test("leaves everything else alone", () => {
    const cookieOnly = new Response("", { headers: { "Set-Cookie": "sid=1" } });
    expect(privateWhenSettingCookies(cookieOnly, req).headers.get("Cache-Control")).toBeNull();
    const publicNoCookie = new Response("", { headers: { "Cache-Control": "public, max-age=60" } });
    expect(privateWhenSettingCookies(publicNoCookie, req).headers.get("Cache-Control")).toBe(
      "public, max-age=60",
    );
    const privateCookie = new Response("", {
      headers: { "Set-Cookie": "a=1", "Cache-Control": "max-age=60" },
    });
    expect(privateWhenSettingCookies(privateCookie, req).headers.get("Cache-Control")).toBe("max-age=60");
  });

  test("copies immutable headers instead of throwing", () => {
    // Like a Response from fetch() or Response.redirect(): set() throws.
    class FrozenHeaders extends Headers {
      override set(): void {
        throw new TypeError("immutable");
      }
    }
    const res = new Response(null, { status: 302 });
    Object.defineProperty(res, "headers", {
      value: new FrozenHeaders({ Location: "/next", "Set-Cookie": "a=1", "Cache-Control": "public" }),
    });
    const out = privateWhenSettingCookies(res, req);
    expect(out).not.toBe(res);
    expect(out.status).toBe(302);
    expect(out.headers.get("Location")).toBe("/next");
    expect(out.headers.get("Cache-Control")).toBe("private");
  });
});

describe("end to end", () => {
  const TMP = resolve(import.meta.dir, ".tmp-cache-control");
  const SRC = resolve(import.meta.dir, "..");

  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(resolve(TMP, "routes"), { recursive: true });
    await writeFile(
      resolve(TMP, "root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
    );
    await writeFile(
      resolve(TMP, "routes/cached.tsx"),
      `import { cache } from "${SRC}/index.ts";
export const headers = () => cache({ public: true, maxAge: 60, sMaxAge: "1h" });
export default function Page() { return <p>cached</p>; }
`,
    );
    await writeFile(
      resolve(TMP, "routes/session.tsx"),
      `import { cache } from "${SRC}/index.ts";
export const headers = () => ({ ...cache({ public: true, maxAge: 60, sMaxAge: "1h" }), "Set-Cookie": "sid=abc" });
export default function Page() { return <p>session</p>; }
`,
    );
  });
  afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("a route's cache() header reaches the document", async () => {
    const app = await createTestApp({ appDir: TMP, serverEntry: false });
    const res = await app.get("/cached");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=3600");
  });

  test("…unless the response also sets a cookie", async () => {
    const app = await createTestApp({ appDir: TMP, serverEntry: false });
    const res = await app.get("/session");
    expect(res.headers.get("Set-Cookie")).toBe("sid=abc");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });
});
