// Root and layout loader errors render an ErrorBoundary (not a JSON body):
// a failed layout's nearest boundary renders in that layout's place, a failed
// root loader gets a framework-rendered error document, and the client
// <Outlet> picks the same boundary from the same loader data.
/* eslint-disable react/display-name -- tiny factory-made test components */
import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Outlet } from "../client/components/Outlet.tsx";
import { RouterContext, type RouterContextValue } from "../client/router.tsx";
import { runLoaders } from "../server/loader.ts";
import { buildTrie } from "../server/matcher.ts";
import { handleRequest } from "../server/request-handler.ts";
import { redirect } from "../server/response.ts";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";
import { BractJSContext, type BractJSContextValue } from "../shared/context.ts";
import { HttpError } from "../shared/errors.ts";
import { firstLoaderFailure, pickBoundaryForFailure, RouteErrorFallback } from "../shared/route-error.ts";

function routeFile(filePath: string) {
  const urlPattern = filePathToPattern(filePath);
  return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
}

const req = (url: string) => new Request(url);

type BoundaryProps = { error: unknown };
const boundary =
  (name: string) =>
  ({ error }: BoundaryProps): ReactElement =>
    createElement(
      "p",
      { id: name },
      `${name}:${(error as { status?: number }).status ?? 500}:${(error as Error).message}`,
    );

const layout = (name: string) => () => createElement("section", { id: name }, createElement(Outlet));
const page = (name: string) => () => createElement("p", { id: name }, name);
const crash = () => {
  throw new Error("must not run for a failed module");
};

const rootModule = {
  default: () => createElement("main", { id: "root" }, createElement(Outlet)),
  ErrorBoundary: boundary("root-boundary"),
  meta: () => [{ title: "Root title" }],
};

const moduleRegistry: Record<string, Record<string, unknown>> = {
  "root.tsx": rootModule,
  // a/ renders and owns a boundary; b/ fails with its own boundary; c/ fails without one.
  "routes/a/layout.tsx": { default: layout("layout-a"), ErrorBoundary: boundary("a-boundary") },
  "routes/a/b/layout.tsx": {
    loader: () => {
      throw new HttpError(403, "no b");
    },
    meta: crash,
    headers: crash,
    default: layout("layout-b"),
    ErrorBoundary: boundary("b-boundary"),
  },
  "routes/a/b/page.tsx": { default: page("page-b"), meta: crash },
  "routes/a/c/layout.tsx": {
    loader: () => {
      throw new HttpError(404, "no c");
    },
    default: layout("layout-c"),
  },
  "routes/a/c/page.tsx": { default: page("page-c") },
  // A route error with no boundary of its own reaches the nearest layout's, not root's.
  "routes/a/leaf.tsx": {
    loader: () => {
      throw new HttpError(404, "no leaf");
    },
    default: page("leaf"),
  },
  // d/ fails with no boundary anywhere below root.
  "routes/d/layout.tsx": {
    loader: () => {
      throw new HttpError(409, "no d");
    },
    default: layout("layout-d"),
  },
  "routes/d/page.tsx": { default: page("page-d") },
  // e/ is a guard-only layout.ts (no component): its boundary renders at the route level.
  "routes/e/layout.ts": {
    loader: () => {
      throw new HttpError(401, "no e");
    },
  },
  "routes/e/page.tsx": { default: page("page-e") },
  // f/ throws an unexpected error.
  "routes/f/layout.tsx": {
    loader: () => {
      throw new Error("kaboom");
    },
    default: layout("layout-f"),
  },
  "routes/f/page.tsx": { default: page("page-f") },
  // g/: a redirect from the route beats an HttpError from the layout, whichever settles first.
  "routes/g/layout.tsx": {
    loader: () => {
      throw new HttpError(500, "layout failed first");
    },
    default: layout("layout-g"),
  },
  "routes/g/page.tsx": {
    loader: async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw redirect("/login");
    },
    default: page("page-g"),
  },
};

const files = [
  "routes/a/b/page.tsx",
  "routes/a/c/page.tsx",
  "routes/a/leaf.tsx",
  "routes/d/page.tsx",
  "routes/e/page.tsx",
  "routes/f/page.tsx",
  "routes/g/page.tsx",
].map(routeFile);
const trie = buildTrie(files);
const config = {
  appDir: "/nonexistent",
  publicDir: "/nonexistent",
  manifest: { clientEntry: "/c.js", routes: {} },
  moduleRegistry,
};

async function doc(path: string): Promise<{ status: number; html: string; headers: Headers }> {
  const res = await handleRequest(req(`http://x${path}`), trie, config, {});
  return { status: res.status, html: await res.text(), headers: res.headers };
}

describe("layout loader errors (document)", () => {
  test("the failed layout's own boundary renders in its place; layouts above still render", async () => {
    const { status, html } = await doc("/a/b/page");
    expect(status).toBe(403);
    expect(html).toContain('id="root"');
    expect(html).toContain('id="layout-a"');
    expect(html).toContain("b-boundary:403:no b");
    expect(html).not.toContain('id="layout-b"');
    expect(html).not.toContain('id="page-b"');
  });

  test("the failed layout's meta/headers and everything below it are skipped", async () => {
    const { html } = await doc("/a/b/page");
    // meta: crash / headers: crash would have turned this into a 500.
    expect(html).toContain("<title>Root title</title>");
  });

  test("a layout without a boundary bubbles to the nearest enclosing layout's", async () => {
    const { status, html } = await doc("/a/c/page");
    expect(status).toBe(404);
    expect(html).toContain('id="layout-a"');
    expect(html).toContain("a-boundary:404:no c");
    expect(html).not.toContain('id="layout-c"');
  });

  test("…and to root's when no layout above has one", async () => {
    const { status, html } = await doc("/d/page");
    expect(status).toBe(409);
    expect(html).toContain('id="root"');
    expect(html).toContain("root-boundary:409:no d");
  });

  test("a route error without its own boundary reaches the nearest layout's before root's", async () => {
    const { status, html } = await doc("/a/leaf");
    expect(status).toBe(404);
    expect(html).toContain("a-boundary:404:no leaf");
    expect(html).not.toContain("root-boundary");
  });

  test("a guard-only layout.ts failure renders its boundary at the route level", async () => {
    const { status, html } = await doc("/e/page");
    expect(status).toBe(401);
    expect(html).toContain("root-boundary:401:no e");
    expect(html).not.toContain('id="page-e"');
  });

  test("an unexpected layout error renders a boundary with a 500", async () => {
    const { status, html } = await doc("/f/page");
    expect(status).toBe(500);
    expect(html).toContain("root-boundary:500:");
    expect(html).not.toContain('id="layout-f"');
  });

  test("a redirect from any loader beats a layout HttpError", async () => {
    const res = await handleRequest(req("http://x/g/page"), trie, config, {});
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
});

describe("layout loader errors (/_data)", () => {
  test("the error rides in the layout's slot with a 200, for <Outlet> to render", async () => {
    const res = await handleRequest(req("http://x/_data?path=/a/b/page"), trie, config, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { layouts: unknown[]; meta: Array<{ title?: string }> };
    expect(body.layouts[1]).toEqual({ __error: { message: "no b", status: 403 } });
    expect(body.meta.some((m) => m.title === "Root title")).toBe(true);
  });

  test("a redirect still wins over a layout HttpError", async () => {
    const res = await handleRequest(req("http://x/_data?path=/g/page"), trie, config, {});
    expect(res.status).toBe(302);
  });
});

describe("root loader errors", () => {
  const rootFails = {
    ...moduleRegistry,
    "root.tsx": {
      ...rootModule,
      loader: () => {
        throw new HttpError(503, "maintenance");
      },
      default: () => {
        throw new Error("root must not render without its data");
      },
    },
  };
  const rootConfig = {
    ...config,
    manifest: { clientEntry: "/c.js", rootCss: ["/build/client/root.css"], routes: {} },
    moduleRegistry: rootFails,
  };

  test("render root's ErrorBoundary in a framework document with the error's status", async () => {
    const res = await handleRequest(req("http://x/d/page"), trie, rootConfig, {});
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<html");
    expect(html).toContain("root-boundary:503:maintenance");
    expect(html).toContain("/build/client/root.css");
    // Nothing to hydrate: no data island, no client entry.
    expect(html).not.toContain("__BRACTJS_DATA__");
    expect(html).not.toContain("/c.js");
  });

  test("without a root ErrorBoundary the built-in fallback renders", async () => {
    const { ErrorBoundary: _omit, ...bare } = rootFails["root.tsx"] as Record<string, unknown>;
    const res = await handleRequest(
      req("http://x/d/page"),
      trie,
      {
        ...rootConfig,
        moduleRegistry: { ...rootFails, "root.tsx": bare },
      },
      {},
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('data-bract-error="503"');
  });

  test("/_data answers with the status, so the client falls back to a document load", async () => {
    const res = await handleRequest(req("http://x/_data?path=/d/page"), trie, rootConfig, {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "maintenance" });
  });
});

describe("runLoaders captures HttpErrors in every slot", () => {
  test("root and layout HttpErrors land in their slots instead of rejecting", async () => {
    const results = await runLoaders(
      {
        root: {
          loader: () => {
            throw new HttpError(418, "teapot");
          },
        },
        layouts: [
          {
            loader: () => {
              throw new HttpError(403, "nope");
            },
          },
        ],
        route: { loader: () => ({ ok: true }) },
      } as never,
      { request: req("http://x/"), params: {}, context: {} } as never,
    );
    expect(results.root).toEqual({ __error: { message: "teapot", status: 418 } });
    expect(results.layouts[0]).toEqual({ __error: { message: "nope", status: 403 } });
    expect(results.route).toEqual({ ok: true });
    expect(firstLoaderFailure(results)?.scope).toBe("root");
  });
});

describe("firstLoaderFailure / pickBoundaryForFailure", () => {
  test("the outermost failed slot wins", () => {
    const e = { __error: { message: "x", status: 400 } };
    expect(firstLoaderFailure({ root: {}, layouts: [{}, e], route: e })).toMatchObject({
      scope: "layout",
      index: 1,
    });
    expect(firstLoaderFailure({ root: {}, layouts: [{}], route: e })?.scope).toBe("route");
    expect(firstLoaderFailure({ root: {}, layouts: [], route: {} })).toBeNull();
  });

  test("own boundary, then enclosing layouts innermost first, then root, then the fallback", () => {
    const A = boundary("A");
    const B = boundary("B");
    const R = boundary("R");
    const layouts = [{ ErrorBoundary: A }, { ErrorBoundary: B }, {}];
    expect(pickBoundaryForFailure(undefined, layouts, 2, R)).toBe(B);
    expect(pickBoundaryForFailure(undefined, layouts, 1, R)).toBe(A);
    expect(pickBoundaryForFailure(undefined, layouts, 0, R)).toBe(R);
    expect(pickBoundaryForFailure(undefined, [], 0, undefined)).toBe(RouteErrorFallback);
  });
});

describe("hydration parity", () => {
  test("the client <Outlet> renders the same boundary markup as SSR", () => {
    const loaderData = {
      root: null,
      layouts: [{ ok: 1 }, { __error: { message: "no b", status: 403 } }],
      route: null,
    };
    const layoutA = moduleRegistry["routes/a/layout.tsx"];
    const layoutB = moduleRegistry["routes/a/b/layout.tsx"];
    const Root = rootModule.default;

    const server = renderToStaticMarkup(
      createElement(
        BractJSContext.Provider,
        {
          value: {
            loaderData,
            actionData: null,
            params: {},
            pathname: "/a/b/page",
            manifest: {},
            LayoutModules: [layoutA, layoutB],
            RootErrorBoundary: rootModule.ErrorBoundary,
          } as unknown as BractJSContextValue,
        },
        createElement(Root),
      ),
    );
    const client = renderToStaticMarkup(
      createElement(
        RouterContext.Provider,
        {
          value: {
            loaderData,
            actionData: null,
            params: {},
            matches: [],
            currentModule: null,
            currentLayouts: [layoutA, layoutB],
            hydrationPending: false,
            rootErrorBoundary: rootModule.ErrorBoundary,
          } as unknown as RouterContextValue,
        },
        createElement(Root),
      ),
    );
    expect(server).toContain("b-boundary:403:no b");
    expect(client).toBe(server);
  });
});
