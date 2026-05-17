import { test, expect, describe } from "bun:test";
import { safeRun, runLoaders, buildLoaderArgs } from "../server/loader.ts";
import { HttpError } from "../shared/errors.ts";
import type { LoaderArgs } from "../shared/route-types.ts";
import type { LayoutChain } from "../server/layout.ts";
import type { RouteModule } from "../shared/route-types.ts";

const stubArgs: LoaderArgs = {
  request: new Request("http://localhost/"),
  params: {},
  context: {},
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
