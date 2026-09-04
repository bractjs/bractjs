import { afterEach, describe, expect, test } from "bun:test";
import { clearApiRoutes, handleApiRequest, route } from "../server/api-route.ts";

// Per-endpoint middleware for typed API routes: `route(m, p, handler,
// { middleware: [...] })`. Runs after the CSRF gate, before body parsing;
// short-circuits by returning a Response; shares ctx.context with the handler
// (its third argument) and exposes `:param` values as ctx.params.

afterEach(() => clearApiRoutes());

/** Same-origin POST (passes the CSRF gate) with a JSON body. */
function post(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "X-BractJS-Action": "1",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("typed API route middleware", () => {
  test("short-circuits with the middleware's Response; handler never runs", async () => {
    let handlerRan = false;
    route(
      "GET",
      "/api/guarded",
      async () => {
        handlerRan = true;
        return { secret: true };
      },
      { middleware: [async () => new Response("Unauthorized", { status: 401 })] },
    );

    const res = await handleApiRequest(new Request("http://localhost/api/guarded"));
    expect(res?.status).toBe(401);
    expect(handlerRan).toBe(false);
  });

  test("ctx.context set by middleware is visible to the handler", async () => {
    route("GET", "/api/me", async (_input, _req, ctx) => ({ user: ctx.context.user }), {
      middleware: [
        async (ctx, next) => {
          ctx.context.user = "alice";
          return next();
        },
      ],
    });

    const res = await handleApiRequest(new Request("http://localhost/api/me"));
    expect(res?.status).toBe(200);
    expect(await res?.json()).toEqual({ user: "alice" });
  });

  test(":param values reach middleware and handler via ctx.params", async () => {
    route("GET", "/api/items/:id", async (_input, _req, ctx) => ({ id: ctx.params.id }));

    const res = await handleApiRequest(new Request("http://localhost/api/items/42"));
    expect(await res?.json()).toEqual({ id: "42" });
  });

  test("middleware chain runs in order around the handler", async () => {
    const order: string[] = [];
    route(
      "GET",
      "/api/ordered",
      async () => {
        order.push("handler");
        return {};
      },
      {
        middleware: [
          async (_ctx, next) => {
            order.push("a:before");
            const res = await next();
            order.push("a:after");
            return res;
          },
          async (_ctx, next) => {
            order.push("b:before");
            const res = await next();
            order.push("b:after");
            return res;
          },
        ],
      },
    );

    await handleApiRequest(new Request("http://localhost/api/ordered"));
    expect(order).toEqual(["a:before", "b:before", "handler", "b:after", "a:after"]);
  });

  test("CSRF gate still fires before middleware on a cross-site POST", async () => {
    let middlewareRan = false;
    route("POST", "/api/write", async () => ({ ok: true }), {
      middleware: [
        async (_ctx, next) => {
          middlewareRan = true;
          return next();
        },
      ],
    });

    const crossSite = new Request("http://localhost/api/write", {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await handleApiRequest(crossSite);
    expect(res?.status).toBe(403);
    expect(middlewareRan).toBe(false);
  });

  test("routes without middleware behave exactly as before", async () => {
    route("POST", "/api/plain", async (input: { n: number }) => ({ doubled: input.n * 2 }));

    const res = await handleApiRequest(post("/api/plain", { n: 21 }));
    expect(res?.status).toBe(200);
    expect(await res?.json()).toEqual({ doubled: 42 });
  });
});
