import { describe, expect, test } from "bun:test";
import type { MiddlewareContext } from "../server/middleware.ts";
import { collectRouteMiddleware, type RouteMiddleware, runRouteMiddleware } from "../server/middleware.ts";

function makeCtx(): MiddlewareContext {
  return { request: new Request("http://localhost/"), params: {}, context: {} };
}

const ok = async () => new Response("ok", { status: 200 });

describe("collectRouteMiddleware", () => {
  test("orders root → layouts → route and flattens arrays", () => {
    const order: string[] = [];
    const mk =
      (label: string): RouteMiddleware =>
      async (_c, n) => {
        order.push(label);
        return n();
      };
    const chain = {
      root: { middleware: mk("root") },
      layouts: [{ middleware: [mk("l0a"), mk("l0b")] }, { middleware: mk("l1") }],
      route: { middleware: mk("route") },
    };
    const fns = collectRouteMiddleware(chain);
    expect(fns).toHaveLength(5);
    return runRouteMiddleware(fns, makeCtx(), ok).then(() => {
      expect(order).toEqual(["root", "l0a", "l0b", "l1", "route"]);
    });
  });

  test("ignores modules without middleware and non-function entries", () => {
    const chain = {
      root: {},
      layouts: [{ middleware: undefined }, { middleware: ["nope" as unknown] }],
      route: { middleware: async (_c: MiddlewareContext, n: () => Promise<Response>) => n() },
    };
    expect(collectRouteMiddleware(chain)).toHaveLength(1);
  });
});

describe("runRouteMiddleware", () => {
  test("empty list calls handler directly", async () => {
    const res = await runRouteMiddleware([], makeCtx(), ok);
    expect(res.status).toBe(200);
  });

  test("a middleware can short-circuit by not calling next()", async () => {
    let handlerRan = false;
    const gate: RouteMiddleware = async () => new Response("denied", { status: 403 });
    const res = await runRouteMiddleware([gate], makeCtx(), async () => {
      handlerRan = true;
      return ok();
    });
    expect(res.status).toBe(403);
    expect(handlerRan).toBe(false);
  });

  test("shares a mutable context across the chain and into the handler", async () => {
    const ctx = makeCtx();
    const setUser: RouteMiddleware = async (c, n) => {
      c.context.user = "alice";
      return n();
    };
    let seenInHandler: unknown;
    await runRouteMiddleware([setUser], ctx, async () => {
      seenInHandler = ctx.context.user;
      return ok();
    });
    expect(seenInHandler).toBe("alice");
  });

  test("rejects if a middleware calls next() twice", async () => {
    const bad: RouteMiddleware = async (_c, n) => {
      await n();
      return n();
    };
    await expect(runRouteMiddleware([bad], makeCtx(), ok)).rejects.toThrow(/more than once/);
  });

  test("outer middleware can post-process the inner Response", async () => {
    const stamp: RouteMiddleware = async (_c, n) => {
      const res = await n();
      const out = new Response(res.body, res);
      out.headers.set("X-Stamped", "1");
      return out;
    };
    const res = await runRouteMiddleware([stamp], makeCtx(), ok);
    expect(res.headers.get("X-Stamped")).toBe("1");
  });
});
