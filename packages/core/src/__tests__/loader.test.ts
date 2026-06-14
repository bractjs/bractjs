import { test, expect, describe, spyOn } from "bun:test";
import { safeRun, runLoaders, buildLoaderArgs } from "../server/loader.ts";
import { HttpError } from "../shared/errors.ts";
import type { LoaderArgs } from "../shared/route-types.ts";
import type { LayoutChain } from "../server/layout.ts";
import type { RouteModule } from "../shared/route-types.ts";

const stubArgs: LoaderArgs = {
  request: new Request("http://localhost/"),
  params: {},
  context: {},
  search: {},
};

const emptyModule: RouteModule = {};

describe("safeRun", () => {
  test("returns null when fn is undefined", async () => {
    const result = await safeRun(undefined, stubArgs);
    expect(result).toBeNull();
  });

  test("returns loader data on success", async () => {
    const result = await safeRun(async () => ({ name: "bract" }), stubArgs);
    expect(result).toEqual({ name: "bract" });
  });

  test("wraps non-redirect errors in __error", async () => {
    const result = await safeRun(async () => { throw new Error("boom"); }, stubArgs);
    // safeRun now returns a sanitized __error object ({ message } in prod,
    // { message, stack } in dev) rather than the raw Error instance, to
    // prevent error-subclass fields from leaking into the SSR HTML payload.
    expect(result).toMatchObject({ __error: { message: expect.any(String) } });
  });

  test("re-throws HttpError (does not wrap)", async () => {
    const fn = async () => { throw new HttpError(403, "Forbidden"); };
    await expect(safeRun(fn, stubArgs)).rejects.toBeInstanceOf(HttpError);
  });

  test("re-throws redirect Response", async () => {
    const fn = async () => { throw new Response(null, { status: 302, headers: { Location: "/" } }); };
    await expect(safeRun(fn, stubArgs)).rejects.toBeInstanceOf(Response);
  });

  test("includes the `where` location in the error log", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await safeRun(async () => { throw new Error("boom"); }, stubArgs, undefined, "routes/x.tsx");
      const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("loader error in routes/x.tsx");
    } finally {
      spy.mockRestore();
    }
  });

  test("dev __error carries the routeFile; prod stays generic", async () => {
    const original = Bun.env.NODE_ENV;
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      Bun.env.NODE_ENV = "development";
      const dev = await safeRun(async () => { throw new Error("boom"); }, stubArgs, undefined, "routes/x.tsx");
      expect(dev).toMatchObject({ __error: { routeFile: "routes/x.tsx" } });

      Bun.env.NODE_ENV = "production";
      const prod = await safeRun(async () => { throw new Error("boom"); }, stubArgs, undefined, "routes/x.tsx") as { __error: Record<string, unknown> };
      expect(prod.__error.routeFile).toBeUndefined();
      expect(prod.__error.message).toBe("Internal Server Error");
    } finally {
      if (original === undefined) delete Bun.env.NODE_ENV;
      else Bun.env.NODE_ENV = original;
      spy.mockRestore();
    }
  });
});

describe("runLoaders", () => {
  test("runs all loaders in parallel and returns results", async () => {
    const chain: LayoutChain = {
      root: { ...emptyModule, loader: async () => ({ root: true }) },
      layouts: [{ ...emptyModule, loader: async () => ({ layout: true }) }],
      route: { ...emptyModule, loader: async () => ({ route: true }) },
    };
    const results = await runLoaders(chain, stubArgs);
    expect(results.root).toEqual({ root: true });
    expect(results.layouts[0]).toEqual({ layout: true });
    expect(results.route).toEqual({ route: true });
  });

  test("returns null for modules without loaders", async () => {
    const chain: LayoutChain = {
      root: emptyModule,
      layouts: [],
      route: emptyModule,
    };
    const results = await runLoaders(chain, stubArgs);
    expect(results.root).toBeNull();
    expect(results.route).toBeNull();
  });

  test("isolates errors — one loader failure doesn't prevent others", async () => {
    const chain: LayoutChain = {
      root: { ...emptyModule, loader: async () => { throw new Error("root fail"); } },
      layouts: [],
      route: { ...emptyModule, loader: async () => ({ ok: true }) },
    };
    const results = await runLoaders(chain, stubArgs);
    expect(results.root).toMatchObject({ __error: { message: expect.any(String) } });
    expect(results.route).toEqual({ ok: true });
  });

  test("runs the route loader concurrently with layout loaders (not serialized after)", async () => {
    // Each loader records when it started relative to the others. If the route
    // loader were serialized after the layout wave (the old behavior), its
    // start would be later than the layout loader's *finish*. With true
    // parallelism, all three observe each other as already-started.
    let started = 0;
    let maxConcurrent = 0;
    const enter = async () => {
      started++;
      maxConcurrent = Math.max(maxConcurrent, started);
      await new Promise((r) => setTimeout(r, 20));
      started--;
    };
    const chain: LayoutChain = {
      root: { ...emptyModule, loader: async () => { await enter(); return { root: true }; } },
      layouts: [{ ...emptyModule, loader: async () => { await enter(); return { layout: true }; } }],
      route: { ...emptyModule, loader: async () => { await enter(); return { route: true }; } },
    };
    await runLoaders(chain, stubArgs);
    // All three loaders must be in flight at the same time.
    expect(maxConcurrent).toBe(3);
  });
});

describe("buildLoaderArgs", () => {
  test("assembles args from request, params, context", () => {
    const req = new Request("http://localhost/blog/42");
    const params = { id: "42" };
    const context = { user: null };
    const args = buildLoaderArgs(req, params, context);
    expect(args.request).toBe(req);
    expect(args.params).toBe(params);
    expect(args.context).toBe(context);
  });
});
