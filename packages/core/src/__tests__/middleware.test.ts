import { describe, expect, test } from "bun:test";
import { authGuard } from "../middleware/authGuard.ts";
import { cors } from "../middleware/cors.ts";
import { requestLogger } from "../middleware/requestLogger.ts";
import type { MiddlewareContext } from "../server/middleware.ts";
import { MiddlewarePipeline } from "../server/middleware.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(override: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    request: new Request("http://localhost/"),
    params: {},
    context: {},
    ...override,
  };
}

const ok200 = async () => new Response("ok", { status: 200 });

// ── MiddlewarePipeline ─────────────────────────────────────────────────────

describe("MiddlewarePipeline", () => {
  test("calls handler when no middleware registered", async () => {
    const pipeline = new MiddlewarePipeline();
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(200);
  });

  test("runs middleware in registration order", async () => {
    const order: number[] = [];
    const pipeline = new MiddlewarePipeline();
    pipeline
      .use(async (ctx, next) => {
        order.push(1);
        const r = await next();
        order.push(4);
        return r;
      })
      .use(async (ctx, next) => {
        order.push(2);
        const r = await next();
        order.push(3);
        return r;
      });

    await pipeline.run(makeCtx(), ok200);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  test("middleware can short-circuit without calling next()", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async () => new Response("blocked", { status: 403 }));
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("blocked");
  });

  test("middleware can modify the response", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      const res = await next();
      const patched = new Response(res.body, res);
      patched.headers.set("X-Test", "injected");
      return patched;
    });
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.headers.get("X-Test")).toBe("injected");
  });

  test("use() is chainable", () => {
    const pipeline = new MiddlewarePipeline();
    const ret = pipeline.use(async (_, next) => next());
    expect(ret).toBe(pipeline);
  });

  test("multiple pipelines are independent", async () => {
    const p1 = new MiddlewarePipeline();
    const p2 = new MiddlewarePipeline();
    p1.use(async () => new Response("p1", { status: 201 }));
    const r1 = await p1.run(makeCtx(), ok200);
    const r2 = await p2.run(makeCtx(), ok200);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
  });
});

// ── cors() ─────────────────────────────────────────────────────────────────

describe("cors()", () => {
  test("adds CORS headers to regular requests for allowed origin", async () => {
    const mw = cors({ origin: "https://example.com" });
    const ctx = makeCtx({
      request: new Request("http://localhost/", { headers: { Origin: "https://example.com" } }),
    });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  test("wildcard origin allows any origin", async () => {
    const mw = cors({ origin: "*" });
    const ctx = makeCtx({
      request: new Request("http://localhost/", { headers: { Origin: "https://any.com" } }),
    });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });

  test("responds 204 to OPTIONS preflight", async () => {
    const mw = cors({ origin: "*" });
    const ctx = makeCtx({ request: new Request("http://localhost/", { method: "OPTIONS" }) });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.status).toBe(204);
  });

  test("does not set CORS header for disallowed origin", async () => {
    const mw = cors({ origin: "https://allowed.com" });
    const ctx = makeCtx({
      request: new Request("http://localhost/", { headers: { Origin: "https://evil.com" } }),
    });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("accepts array of origins", async () => {
    const mw = cors({ origin: ["https://a.com", "https://b.com"] });
    const ctx = makeCtx({
      request: new Request("http://localhost/", { headers: { Origin: "https://b.com" } }),
    });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://b.com");
  });

  test("sets Access-Control-Allow-Methods header", async () => {
    const mw = cors({ origin: "*", methods: ["GET", "POST"] });
    const ctx = makeCtx({ request: new Request("http://localhost/", { method: "OPTIONS" }) });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(ctx, ok200);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
  });
});

// ── authGuard() ───────────────────────────────────────────────────────────

describe("authGuard()", () => {
  function makeSession(user: unknown) {
    return {
      getSession: async () => ({ get: (key: string) => (key === "user" ? user : undefined) }),
    };
  }

  test("sets ctx.context.user from session", async () => {
    const mw = authGuard({ session: makeSession({ id: 1 }) });
    const ctx = makeCtx();
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    await pipeline.run(ctx, ok200);
    expect(ctx.context.user).toEqual({ id: 1 });
  });

  test("sets ctx.context.user to null when no session user", async () => {
    const mw = authGuard({ session: makeSession(undefined) });
    const ctx = makeCtx();
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    await pipeline.run(ctx, ok200);
    expect(ctx.context.user).toBeNull();
  });

  test("required=true returns 401 when no user", async () => {
    const mw = authGuard({ session: makeSession(undefined), required: true });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  test("required=true allows request when user is present", async () => {
    const mw = authGuard({ session: makeSession({ id: 99 }), required: true });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(200);
  });

  test("required=false (default) allows unauthenticated request", async () => {
    const mw = authGuard({ session: makeSession(undefined), required: false });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(200);
  });
});

// ── requestLogger() ───────────────────────────────────────────────────────

describe("requestLogger()", () => {
  test("passes the response through unchanged", async () => {
    const mw = requestLogger();
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    const res = await pipeline.run(makeCtx(), ok200);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("logs path and status to console (smoke test)", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    const mw = requestLogger();
    const ctx = makeCtx({ request: new Request("http://localhost/hello") });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    await pipeline.run(ctx, ok200);
    console.log = original;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain("/hello");
    expect(logs[0]).toContain("200");
  });

  // SECURITY(medium) regression guard: the query string can carry tokens
  // (password-reset links, OAuth codes). requestLogger must log only the
  // pathname, never the search params.
  test("never logs the query string (token leak guard)", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    const mw = requestLogger();
    const ctx = makeCtx({
      request: new Request("http://localhost/reset?token=SUPER_SECRET_TOKEN&code=abc123"),
    });
    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);
    await pipeline.run(ctx, ok200);
    console.log = original;
    const line = logs.join("\n");
    expect(line).toContain("/reset");
    expect(line).not.toContain("SUPER_SECRET_TOKEN");
    expect(line).not.toContain("token=");
    expect(line).not.toContain("abc123");
  });
});
