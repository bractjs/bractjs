// clientMiddleware + client context + clientLoader over every slice
// (client/client-data.ts), shared by navigation, revalidation, submissions
// and fetchers.
import { describe, expect, test } from "bun:test";
import {
  applyClientLoaders,
  type ClientChain,
  createClientContext,
  runClientMiddleware,
} from "../client/client-data.ts";
import type { RouteModuleClient } from "../client/router.tsx";
import { redirect } from "../server/response.ts";
import type { ClientMiddlewareFunction } from "../shared/route-types.ts";
import { createContext } from "../shared/router-context.ts";

const args = () => ({ request: new Request("http://x/page"), params: {}, context: createClientContext() });
const mod = (m: Partial<RouteModuleClient>) => m as RouteModuleClient;

describe("runClientMiddleware", () => {
  test("runs root → layouts → route around the work, outermost first", async () => {
    const log: string[] = [];
    const mw =
      (name: string): ClientMiddlewareFunction =>
      async (_args, next) => {
        log.push(`${name}:before`);
        await next();
        log.push(`${name}:after`);
      };
    const chain: ClientChain = {
      root: mod({ clientMiddleware: [mw("root")] }),
      layouts: [mod({ clientMiddleware: [mw("layout")] }), null],
      route: mod({ clientMiddleware: [mw("route-a"), mw("route-b")] }),
    };
    const result = await runClientMiddleware(chain, args(), async () => {
      log.push("work");
      return 42;
    });
    expect(result).toBe(42);
    expect(log).toEqual([
      "root:before",
      "layout:before",
      "route-a:before",
      "route-b:before",
      "work",
      "route-b:after",
      "route-a:after",
      "layout:after",
      "root:after",
    ]);
  });

  test("a middleware that doesn't call next() still lets the chain continue", async () => {
    const chain: ClientChain = {
      root: mod({ clientMiddleware: [() => undefined] }),
      layouts: [],
      route: null,
    };
    expect(await runClientMiddleware(chain, args(), async () => "done")).toBe("done");
  });

  test("a thrown redirect aborts the work", async () => {
    let ran = false;
    const chain: ClientChain = {
      root: null,
      layouts: [],
      route: mod({
        clientMiddleware: [
          () => {
            throw redirect("/login");
          },
        ],
      }),
    };
    const err = await runClientMiddleware(chain, args(), async () => {
      ran = true;
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).headers.get("Location")).toBe("/login");
    expect(ran).toBe(false);
  });

  test("calling next() twice is an error", async () => {
    const chain: ClientChain = {
      root: mod({
        clientMiddleware: [
          async (_a, next) => {
            await next();
            await next();
          },
        ],
      }),
      layouts: [],
      route: null,
    };
    await expect(runClientMiddleware(chain, args(), async () => 1)).rejects.toThrow("more than once");
  });
});

describe("applyClientLoaders", () => {
  test("each module's clientLoader replaces its own slice, sharing the middleware's context", async () => {
    const user = createContext<string>("anonymous");
    const a = args();
    const chain: ClientChain = {
      root: mod({ clientLoader: async ({ context }) => ({ who: context.get(user) }) }),
      layouts: [null, mod({ clientLoader: async ({ serverLoader }) => ({ wrapped: await serverLoader() }) })],
      route: mod({ clientLoader: async ({ params, search }) => ({ params, search }) }),
    };
    const data: Record<string, unknown> = {
      root: { server: true },
      layouts: [{ l0: 1 }, { l1: 2 }],
      route: null,
    };
    await runClientMiddleware(
      {
        ...chain,
        root: mod({ ...chain.root, clientMiddleware: [({ context }) => context.set(user, "ada")] }),
      },
      a,
      () => applyClientLoaders(chain, data, { ...a, params: { id: "7" }, search: { q: "x" } }),
    );
    expect(data.root).toEqual({ who: "ada" });
    expect(data.layouts).toEqual([{ l0: 1 }, { wrapped: { l1: 2 } }]);
    expect(data.route).toEqual({ params: { id: "7" }, search: { q: "x" } });
  });

  test("a failing clientLoader keeps the server slice", async () => {
    const data: Record<string, unknown> = { root: null, layouts: [], route: { server: 1 } };
    const chain: ClientChain = {
      root: null,
      layouts: [],
      route: mod({
        clientLoader: async () => {
          throw new Error("offline");
        },
      }),
    };
    const err = console.error;
    console.error = () => {};
    try {
      await applyClientLoaders(chain, data, { ...args(), search: {} });
    } finally {
      console.error = err;
    }
    expect(data.route).toEqual({ server: 1 });
  });

  test("a redirect thrown OR returned by a clientLoader propagates (React Router parity)", async () => {
    for (const clientLoader of [
      async () => {
        throw new Response(null, { status: 302, headers: { Location: "/login" } });
      },
      async () => new Response(null, { status: 302, headers: { Location: "/login" } }),
    ]) {
      const data: Record<string, unknown> = { root: null, layouts: [], route: { server: 1 } };
      const chain: ClientChain = { root: null, layouts: [], route: mod({ clientLoader }) };
      let caught: unknown;
      try {
        await applyClientLoaders(chain, data, { ...args(), search: {} });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Response);
      expect((caught as Response).headers.get("Location")).toBe("/login");
    }
  });

  test("a thrown non-redirect Response is still logged and keeps the server slice", async () => {
    const data: Record<string, unknown> = { root: null, layouts: [], route: { server: 1 } };
    const chain: ClientChain = {
      root: null,
      layouts: [],
      route: mod({
        clientLoader: async () => {
          throw new Response("nope", { status: 404 });
        },
      }),
    };
    const err = console.error;
    console.error = () => {};
    try {
      await applyClientLoaders(chain, data, { ...args(), search: {} });
    } finally {
      console.error = err;
    }
    expect(data.route).toEqual({ server: 1 });
  });
});
