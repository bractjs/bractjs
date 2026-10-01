// Production middleware: requestId, requestLogger formats, healthCheck,
// secureHeaders, rateLimit / createRateLimiter, getClientAddress, and
// server-side session storage + the cookie-size guard.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { healthCheck } from "../middleware/healthCheck.ts";
import { createRateLimiter, memoryRateLimitStore, rateLimit } from "../middleware/rateLimit.ts";
import { requestId } from "../middleware/requestId.ts";
import { requestLogger } from "../middleware/requestLogger.ts";
import { secureHeaders } from "../middleware/secureHeaders.ts";
import { getClientAddress, setClientAddress } from "../server/client-address.ts";
import { createMiddlewareContext, type MiddlewareFn } from "../server/middleware.ts";
import { BunAdapter } from "../server/adapter.ts";
import { buildTrie } from "../server/matcher.ts";
import { getRequestId, runWithRequest, setRequestId } from "../server/request-context.ts";
import { handleRequest } from "../server/request-handler.ts";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";
import {
  createCookieSession,
  createMemorySessionStorage,
  createSessionStorage,
  type SessionData,
} from "../server/session.ts";
import { HttpError } from "../shared/errors.ts";
import { RequestIdContext } from "../shared/request-id.ts";
import { RouteErrorFallback } from "../shared/route-error.ts";

const SECRET = "s3cret-s3cret-s3cret";

/** Run one middleware inside a request scope; `inner` plays the rest of the app. */
async function run(
  mw: MiddlewareFn,
  request: Request,
  inner: () => Response | Promise<Response> = () => new Response("ok"),
): Promise<Response> {
  const ctx = createMiddlewareContext(request);
  return runWithRequest(request, async () => {
    const res = await mw(ctx, async () => inner());
    return res ?? inner();
  });
}

describe("requestId()", () => {
  test("generates an id, echoes it, and exposes it to the request", async () => {
    let seen: string | undefined;
    const res = await run(requestId(), new Request("http://x/"), () => {
      seen = getRequestId();
      return new Response("ok");
    });
    const id = res.headers.get("X-Request-Id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen).toBe(id!);
  });

  test("reuses a safe incoming id and replaces an unsafe one", async () => {
    const safe = await run(
      requestId(),
      new Request("http://x/", { headers: { "X-Request-Id": "lb-123.abc" } }),
    );
    expect(safe.headers.get("X-Request-Id")).toBe("lb-123.abc");
    const unsafe = await run(
      requestId(),
      new Request("http://x/", { headers: { "X-Request-Id": "evil <script> id" } }),
    );
    expect(unsafe.headers.get("X-Request-Id")).not.toContain("evil");
    const tooLong = await run(
      requestId(),
      new Request("http://x/", { headers: { "X-Request-Id": "a".repeat(200) } }),
    );
    expect(tooLong.headers.get("X-Request-Id")).toHaveLength(36);
  });

  test("the built-in fallback shows it for server errors only", () => {
    const render = (error: unknown) =>
      renderToStaticMarkup(
        createElement(
          RequestIdContext.Provider,
          { value: "req-1" },
          createElement(RouteErrorFallback, { error }),
        ),
      );
    expect(render(new Error("boom"))).toContain("Request ID: req-1");
    expect(render(new HttpError(404, "nope"))).not.toContain("Request ID");
  });
});

describe("requestLogger()", () => {
  test("text format includes the request id when present", async () => {
    const lines: string[] = [];
    const logger = requestLogger({ write: (l) => lines.push(l) });
    const both: MiddlewareFn = async (ctx, next) =>
      requestId({ generate: () => "id-1" })(ctx, () => logger(ctx, next) as Promise<Response>);
    await run(both, new Request("http://x/posts?token=secret"));
    expect(lines[0]).toMatch(/^\[id-1\] \[GET\] \/posts → 200 in \d+ms$/);
  });

  test("json format writes one object per line, never the query string", async () => {
    const lines: string[] = [];
    await run(
      requestLogger({ format: "json", write: (l) => lines.push(l) }),
      new Request("http://x/a?token=t"),
      () => new Response("x", { status: 503 }),
    );
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: "error", method: "GET", path: "/a", status: 503 });
    expect(lines[0]).not.toContain("token");
  });
});

describe("healthCheck()", () => {
  test("answers its path before the app, 200 or 503", async () => {
    const ok = await run(healthCheck(), new Request("http://x/healthz"), () => {
      throw new Error("app must not run");
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: "ok" });

    const down = await run(
      healthCheck({ check: () => Promise.reject(new Error("db down")) }),
      new Request("http://x/healthz"),
    );
    expect(down.status).toBe(503);
    expect(await down.text()).not.toContain("db down");
  });

  test("passes other paths through", async () => {
    const res = await run(healthCheck(), new Request("http://x/other"));
    expect(await res.text()).toBe("ok");
  });
});

describe("secureHeaders()", () => {
  test("adds the policy headers; HSTS only over HTTPS; keeps headers the app set", async () => {
    const http = await run(
      secureHeaders(),
      new Request("http://x/"),
      () => new Response("x", { headers: { "Cross-Origin-Opener-Policy": "unsafe-none" } }),
    );
    expect(http.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(http.headers.get("Cross-Origin-Opener-Policy")).toBe("unsafe-none");
    expect(http.headers.get("Strict-Transport-Security")).toBeNull();

    const proxied = await run(
      secureHeaders(),
      new Request("http://x/", { headers: { "X-Forwarded-Proto": "https" } }),
    );
    expect(proxied.headers.get("Strict-Transport-Security")).toContain("max-age=");
    const off = await run(secureHeaders({ hsts: false }), new Request("https://x/"));
    expect(off.headers.get("Strict-Transport-Security")).toBeNull();
  });

  test("works on responses with immutable headers", async () => {
    const res = await run(secureHeaders(), new Request("http://x/"), () =>
      Response.redirect("http://x/b", 302),
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.status).toBe(302);
  });
});

describe("rateLimit() / createRateLimiter()", () => {
  test("429s past the limit per client address, with Retry-After", async () => {
    const mw = rateLimit({ max: 2, windowMs: 60_000 });
    const from = (ip: string) => {
      const req = new Request("http://x/api");
      setClientAddress(req, ip);
      return req;
    };
    expect((await run(mw, from("1.1.1.1"))).status).toBe(200);
    const second = await run(mw, from("1.1.1.1"));
    expect(second.headers.get("RateLimit-Remaining")).toBe("0");
    const third = await run(mw, from("1.1.1.1"));
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another client has its own bucket.
    expect((await run(mw, from("2.2.2.2"))).status).toBe(200);
  });

  test("an unknown client address is not limited (no shared lockout bucket)", async () => {
    const mw = rateLimit({ max: 1, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) expect((await run(mw, new Request("http://x/"))).status).toBe(200);
  });

  test("trustProxy keys on X-Forwarded-For; match scopes the limit", async () => {
    const mw = rateLimit({ max: 1, windowMs: 60_000, trustProxy: true, match: (r) => r.method === "POST" });
    const post = () =>
      new Request("http://x/login", { method: "POST", headers: { "X-Forwarded-For": "9.9.9.9, 10.0.0.1" } });
    expect((await run(mw, post())).status).toBe(200);
    expect((await run(mw, post())).status).toBe(429);
    expect(
      (await run(mw, new Request("http://x/login", { headers: { "X-Forwarded-For": "9.9.9.9" } }))).status,
    ).toBe(200);
  });

  test("createRateLimiter counts per key and resets", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, store: memoryRateLimitStore() });
    expect((await limiter.check("ada")).ok).toBe(true);
    expect((await limiter.check("ada")).ok).toBe(false);
    await limiter.reset("ada");
    expect((await limiter.check("ada")).ok).toBe(true);
  });
});

describe("getClientAddress()", () => {
  test("socket address by default; proxy headers only when trusted", () => {
    const req = new Request("http://x/", { headers: { "X-Forwarded-For": "6.6.6.6" } });
    setClientAddress(req, "127.0.0.1");
    expect(getClientAddress(req)).toBe("127.0.0.1");
    expect(getClientAddress(req, { trustProxy: true })).toBe("6.6.6.6");
    expect(getClientAddress(new Request("http://x/"))).toBeUndefined();
  });
});

describe("server-side sessions", () => {
  const cookie = { name: "__s", secrets: [SECRET], maxAge: 60 };
  const cookiePair = (setCookie: string) => setCookie.split(";")[0];

  test("the cookie carries only a signed id; data round-trips through the store", async () => {
    const storage = createMemorySessionStorage({ cookie });
    const session = await storage.getSession(null);
    expect(session.id).toBe("");
    session.set("user", { id: 7, roles: ["admin"] });
    const set = await storage.commitSession(session);
    expect(set).not.toContain("admin");

    const again = await storage.getSession(cookiePair(set));
    expect(again.id).not.toBe("");
    expect(again.get("user")).toEqual({ id: 7, roles: ["admin"] });
  });

  test("a forged id or a destroyed session reads as empty", async () => {
    const storage = createMemorySessionStorage({ cookie });
    const session = await storage.getSession(null);
    session.set("a", 1);
    const pair = cookiePair(await storage.commitSession(session));
    const forged = pair.replace(/=([^.]+)\./, "=00000000-0000-0000-0000-000000000000.");
    expect((await storage.getSession(forged)).get("a")).toBeUndefined();

    const live = await storage.getSession(pair);
    expect(await storage.destroySession(live)).toContain("Max-Age=0");
    expect((await storage.getSession(pair)).get("a")).toBeUndefined();
  });

  test("createSessionStorage calls the data strategy (create, then update)", async () => {
    const calls: string[] = [];
    const db = new Map<string, SessionData>();
    const storage = createSessionStorage({
      cookie,
      createData: (data) => {
        calls.push("create");
        db.set("id-1", data);
        return "id-1";
      },
      readData: (id) => db.get(id) ?? null,
      updateData: (id, data) => {
        calls.push("update");
        db.set(id, data);
      },
      deleteData: (id) => {
        db.delete(id);
      },
    });
    const s1 = await storage.getSession(null);
    s1.set("n", 1);
    const pair = cookiePair(await storage.commitSession(s1));
    const s2 = await storage.getSession(pair);
    s2.set("n", 2);
    await storage.commitSession(s2);
    expect(calls).toEqual(["create", "update"]);
    expect(db.get("id-1")).toEqual({ n: 2 });
  });

  test("cookie sessions refuse to exceed 4096 bytes, and support Domain", async () => {
    const storage = createCookieSession({ name: "__c", secrets: [SECRET], domain: "example.com" });
    const session = await storage.getSession(null);
    session.set("small", "x");
    expect(await storage.commitSession(session)).toContain("Domain=example.com");
    session.set("big", "x".repeat(5000));
    await expect(storage.commitSession(session)).rejects.toThrow("browsers silently drop cookies over 4096");
  });
});

describe("request id and client address through the real server pieces", () => {
  const routeFile = (filePath: string) => {
    const urlPattern = filePathToPattern(filePath);
    return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
  };
  const trie = buildTrie([routeFile("routes/_index.tsx")]);
  const config = {
    appDir: "/nonexistent",
    publicDir: "/nonexistent",
    manifest: { clientEntry: "/c.js", routes: {} },
    moduleRegistry: {
      "root.tsx": { default: () => createElement("main", null, "root") },
      "routes/_index.tsx": { loader: () => ({ ok: true }), default: () => null },
    },
  };
  const withId = (url: string) => {
    const req = new Request(url);
    return runWithRequest(req, () => {
      setRequestId("rid-9");
      return handleRequest(req, trie, config, {});
    });
  };

  test("the document and /_data carry the id, so client fallbacks match the server", async () => {
    expect(await (await withId("http://x/")).text()).toContain('"requestId":"rid-9"');
    expect(((await (await withId("http://x/_data?path=/")).json()) as { requestId: string }).requestId).toBe(
      "rid-9",
    );
  });

  test("BunAdapter records the socket address for getClientAddress()", async () => {
    const adapter = new BunAdapter();
    adapter.setHandler(async (req) => new Response(getClientAddress(req) ?? "none"));
    const port = 5100 + Math.floor(Math.random() * 400);
    adapter.listen(port);
    try {
      const body = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      expect(body).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
    } finally {
      adapter.stop();
    }
  });
});
