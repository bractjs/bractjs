/**
 * React Router 7 / 8 compatibility surface: typed context, instrumentation,
 * data(), thrown error Responses, links/meta, route-module exports, and the
 * client-side hooks/components that have a server-renderable contract.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generatePath } from "../client/build-path.ts";
import { Await, useAsyncValue } from "../client/components/Await.tsx";
import { Links, Meta } from "../client/components/Head.tsx";
import { NavLink } from "../client/components/NavLink.tsx";
import { Outlet, useOutletContext } from "../client/components/Outlet.tsx";
import { fetcherStore } from "../client/fetcher-store.ts";
import { useFormAction, useHref, useResolvedPath } from "../client/hooks/compat.ts";
import { useNavigation } from "../client/hooks/useNavigation.ts";
import { useRouteLoaderData } from "../client/hooks/useRouteLoaderData.ts";
import { createSearchParams, useSearchParams } from "../client/hooks/useSearchParams.ts";
import { normalizeSubmission } from "../client/submission.ts";
import {
  clearInstrumentations,
  instrument,
  instrumentRequest,
  type InstrumentResult,
} from "../server/instrumentation.ts";
import { runAction, runLoaders, runRouteContext } from "../server/loader.ts";
import { resolveLinks, resolveMeta } from "../server/meta.ts";
import { collectRouteMiddleware, createMiddlewareContext, runRouteMiddleware } from "../server/middleware.ts";
import { handleRequest } from "../server/request-handler.ts";
import { redirect, redirectDocument, replace } from "../server/response.ts";
import { buildTrie } from "../server/matcher.ts";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";
import { createCookieSession, createCookieSessionStorage } from "../server/session.ts";
import { BractJSProvider, type BractJSContextValue } from "../shared/context.ts";
import { data } from "../shared/data.ts";
import { HttpError, isRouteErrorResponse } from "../shared/errors.ts";
import { LinkTags } from "../shared/link-tags.tsx";
import { MetaTags } from "../shared/meta-tags.tsx";
import { renderErrorBoundary, useRouteError } from "../shared/route-error.ts";
import type { LoaderArgs, MetaDescriptor } from "../shared/route-types.ts";
import { createContext, RouterContextProvider, withContextAccessors } from "../shared/router-context.ts";

const req = (url = "http://x/") => new Request(url);
const args = (context = new RouterContextProvider()): LoaderArgs => ({
  request: req(),
  params: {},
  context,
  search: {},
  url: new URL("http://x/"),
});

afterEach(() => clearInstrumentations());

// ── Typed context ──────────────────────────────────────────────────────────

describe("createContext / RouterContextProvider", () => {
  test("set/get round-trips a typed value alongside string fields", () => {
    const userCtx = createContext<{ name: string }>();
    const c = withContextAccessors({ legacy: 1 } as Record<string, unknown>);
    c.set(userCtx, { name: "ada" });
    expect(c.get(userCtx).name).toBe("ada");
    expect(c.legacy).toBe(1);
    // Accessors are non-enumerable: spreading/serializing sees only fields.
    expect(Object.keys(c)).toEqual(["legacy"]);
    expect(JSON.stringify(c)).toBe('{"legacy":1}');
  });

  test("default value is returned when unset; no default throws", () => {
    const withDefault = createContext("fallback");
    const without = createContext<string>();
    const c = new RouterContextProvider();
    expect(c.get(withDefault)).toBe("fallback");
    expect(() => c.get(without)).toThrow(/No value found/);
  });

  test("RouterContextProvider accepts a Map (RR) or plain fields (BractJS)", () => {
    const k = createContext<number>();
    expect(new RouterContextProvider(new Map([[k, 7]])).get(k)).toBe(7);
    expect(new RouterContextProvider({ user: "bob" }).user).toBe("bob");
  });

  test("a defineContext() merge keeps values middleware set()", async () => {
    const k = createContext<string>();
    const base = new RouterContextProvider();
    base.set(k, "from-middleware");
    const merged = await runRouteContext(
      { context: { _factory: () => ({ extra: true }) } } as never,
      req(),
      {},
      base,
    );
    expect(merged.extra).toBe(true);
    expect(merged.get(k)).toBe("from-middleware");
  });
});

// ── Middleware (RR return semantics, unstable_middleware) ───────────────────

describe("route middleware compat", () => {
  test("a middleware that returns nothing continues the chain", async () => {
    const seen: string[] = [];
    const res = await runRouteMiddleware(
      [
        async () => {
          seen.push("a");
        },
        async (_ctx, next) => {
          seen.push("b");
          await next(); // RR style: call next, return nothing
        },
      ],
      createMiddlewareContext(req()),
      async () => new Response("handler"),
    );
    expect(seen).toEqual(["a", "b"]);
    expect(await res.text()).toBe("handler");
  });

  test("unstable_middleware is collected when middleware is absent", () => {
    const fn = async (_c: unknown, next: () => Promise<Response>) => next();
    const list = collectRouteMiddleware({ root: {}, layouts: [], route: { unstable_middleware: [fn] } });
    expect(list).toHaveLength(1);
  });
});

// ── Instrumentation ─────────────────────────────────────────────────────────

describe("instrument()", () => {
  test("loader wrappers observe success and errors but cannot change the result", async () => {
    const events: Array<[string, InstrumentResult["status"]]> = [];
    instrument({
      async loader(call, info) {
        const r = await call();
        events.push([info.id, r.status]);
        return "ignored";
      },
    });
    const results = await runLoaders(
      {
        root: { loader: () => ({ ok: 1 }) },
        layouts: [],
        route: {
          loader: () => {
            throw new Error("nope");
          },
        },
        files: { root: "root.tsx", layouts: [], route: "routes/x.tsx" },
      },
      args(),
    );
    expect(results.root).toEqual({ ok: 1 });
    expect(results.route).toHaveProperty("__error");
    expect(events).toContainEqual(["root.tsx", "success"]);
    expect(events).toContainEqual(["routes/x.tsx", "error"]);
  });

  test("a throwing wrapper, or one that never calls call(), still runs the work once", async () => {
    let runs = 0;
    instrument(
      {
        loader() {
          throw new Error("instrumentation bug");
        },
      },
      { loader: () => undefined },
    );
    const results = await runLoaders({ root: {}, layouts: [], route: { loader: () => ++runs } }, args());
    expect(results.route).toBe(1);
    expect(runs).toBe(1);
  });

  test("React Router shape: handler().instrument({ request }) and route(r).instrument()", async () => {
    const seen: string[] = [];
    instrument({
      handler(h) {
        h.instrument({
          async request(call) {
            seen.push("request:start");
            await call();
            seen.push("request:end");
          },
        });
      },
      route(r) {
        if (r.id === "routes/admin.tsx") {
          r.instrument({
            async action(call) {
              await call();
              seen.push(`action:${r.id}`);
            },
          });
        }
      },
    });
    const res = await instrumentRequest(
      { request: req(), context: new RouterContextProvider() },
      async () => new Response("ok"),
    );
    expect(await res.text()).toBe("ok");
    await runAction({ action: () => "done" }, { ...args(), formData: new FormData() }, "routes/admin.tsx");
    await runAction({ action: () => "done" }, { ...args(), formData: new FormData() }, "routes/other.tsx");
    expect(seen).toEqual(["request:start", "request:end", "action:routes/admin.tsx"]);
  });

  test("unregister removes the instrumentation", async () => {
    let n = 0;
    const off = instrument({ loader: async (call) => void (await call(), n++) });
    await runLoaders({ root: {}, layouts: [], route: { loader: () => 1 } }, args());
    off();
    await runLoaders({ root: {}, layouts: [], route: { loader: () => 1 } }, args());
    expect(n).toBe(1);
  });
});

// ── data() and thrown error responses ──────────────────────────────────────

describe("data() / thrown Responses", () => {
  test("loaders returning data() are unwrapped and their init kept", async () => {
    const results = await runLoaders(
      {
        root: {},
        layouts: [],
        route: { loader: () => data({ post: 1 }, { status: 201, headers: { "X-A": "1" } }) },
      },
      args(),
    );
    expect(results.route).toEqual({ post: 1 });
    expect(results.inits?.route?.status).toBe(201);
    expect(new Headers(results.inits?.route?.headers).get("X-A")).toBe("1");
  });

  test("a thrown 404 Response / data() in a route loader becomes an HttpError slot", async () => {
    const viaResponse = await runLoaders(
      {
        root: {},
        layouts: [],
        route: {
          loader: () => {
            throw new Response("No such post", { status: 404 });
          },
        },
      },
      args(),
    );
    expect(viaResponse.route).toEqual({ __error: { message: "No such post", status: 404 } });

    const viaData = await runLoaders(
      {
        root: {},
        layouts: [],
        route: {
          loader: () => {
            throw data("Gone", { status: 410 });
          },
        },
      },
      args(),
    );
    expect(viaData.route).toEqual({ __error: { message: "Gone", status: 410 } });
  });

  test("a thrown error Response in an action becomes an HttpError; redirects stay responses", async () => {
    const a = { ...args(), formData: new FormData() };
    const err = await runAction(
      {
        action: () => {
          throw new Response("Forbidden", { status: 403 });
        },
      },
      a,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    const redir = await runAction(
      {
        action: () => {
          throw redirect("/login");
        },
      },
      a,
    ).catch((e: unknown) => e);
    expect(redir).toBeInstanceOf(Response);
  });

  test("isRouteErrorResponse recognizes HttpError and RR-shaped objects", () => {
    const e = new HttpError(404);
    expect(isRouteErrorResponse(e)).toBe(true);
    expect(e.statusText).toBe("Not Found");
    expect(e.data).toBe("Not Found");
    expect(isRouteErrorResponse({ status: 500, statusText: "x", data: null, internal: false })).toBe(true);
    expect(isRouteErrorResponse(new Error("x"))).toBe(false);
  });
});

// ── meta / links ────────────────────────────────────────────────────────────

describe("meta() React Router arguments and links()", () => {
  test("meta receives data, location and matches with ancestors' meta", () => {
    let seen: {
      data: unknown;
      matches: Array<{ id: string; meta: MetaDescriptor[] }>;
      pathname: string;
    } | null = null;
    resolveMeta(
      {
        root: { meta: () => [{ title: "Site" }] },
        layouts: [],
        route: {
          meta: (a) => {
            seen = { data: a.data, matches: a.matches, pathname: a.location.pathname };
            return [];
          },
        },
        files: { root: "root.tsx", layouts: [], route: "routes/p.tsx" },
      },
      { root: null, layouts: [], route: { t: 1 } },
      {},
      { pathname: "/p", search: "?a=1" },
    );
    expect(seen!.data).toEqual({ t: 1 });
    expect(seen!.pathname).toBe("/p");
    expect(seen!.matches[0].id).toBe("root.tsx");
    expect(seen!.matches[0].meta).toEqual([{ title: "Site" }]);
  });

  test("links() are collected root → route and deduped", () => {
    const links = resolveLinks({
      root: { links: () => [{ rel: "icon", href: "/favicon.ico" }] },
      layouts: [{ links: () => [{ rel: "stylesheet", href: "/a.css" }] }],
      route: {
        links: () => [
          { rel: "stylesheet", href: "/a.css" },
          { rel: "preload", href: "/f.woff2", as: "font" },
        ],
      },
    });
    expect(links.map((l) => l.href)).toEqual(["/favicon.ico", "/a.css", "/f.woff2"]);
  });

  test("LinkTags renders links; stylesheets get a precedence", () => {
    const html = renderToStaticMarkup(
      <LinkTags
        links={[
          { rel: "stylesheet", href: "/a.css" },
          { rel: "preconnect", href: "https://cdn.example", crossOrigin: "anonymous" },
        ]}
      />,
    );
    expect(html).toContain('href="/a.css"');
    expect(html).toContain('rel="preconnect"');
  });

  test("MetaTags supports React Router descriptors: JSON-LD, link, charSet", () => {
    const html = renderToStaticMarkup(
      <MetaTags
        meta={[
          { charSet: "utf-8" },
          { tagName: "link", rel: "canonical", href: "https://x.test/p" },
          { "script:ld+json": { "@type": "Thing", name: "</script>" } } as unknown as MetaDescriptor,
        ]}
      />,
    );
    expect(html).toContain('charSet="utf-8"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).not.toContain("</script><");
    expect(html).toContain("\\u003c/script>");
  });

  test("<Meta /> and <Links /> render nothing (BractJS renders head tags itself)", () => {
    expect(
      renderToStaticMarkup(
        <>
          <Meta />
          <Links />
        </>,
      ),
    ).toBe("");
  });
});

// ── End-to-end through handleRequest ───────────────────────────────────────

function routeFile(filePath: string) {
  const urlPattern = filePathToPattern(filePath);
  return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
}

describe("handleRequest with React Router-style route modules", () => {
  const files = [routeFile("routes/gone.tsx"), routeFile("routes/hydrate.tsx"), routeFile("routes/save.tsx")];
  const trie = buildTrie(files);
  const moduleRegistry = {
    "root.tsx": {
      default: () => createElement(Outlet),
      links: () => [{ rel: "icon", href: "/icon.svg" }],
    },
    "routes/gone.tsx": {
      loader: () => data({ why: "archived" }, { status: 410, headers: { "X-Why": "archived" } }),
      headers: ({ loaderHeaders }: { loaderHeaders: Headers }) => ({
        "X-Why": loaderHeaders.get("X-Why") ?? "",
      }),
      default: ({ loaderData }: { loaderData: { why: string } }) =>
        createElement("p", null, `gone:${loaderData.why}`),
    },
    "routes/hydrate.tsx": {
      loader: () => ({ server: true }),
      clientLoader: Object.assign(() => ({ client: true }), { hydrate: true }),
      HydrateFallback: () => createElement("p", null, "HYDRATE-FALLBACK"),
      default: () => createElement("p", null, "REAL-COMPONENT"),
    },
    "routes/save.tsx": {
      action: () => data({ saved: true }, { status: 201, headers: { "Set-Cookie": "flash=1; Path=/" } }),
      default: () => createElement("p", null, "save"),
    },
  };
  const config = {
    appDir: "/nonexistent",
    publicDir: "/nonexistent",
    manifest: { clientEntry: "/c.js", routes: {} },
    moduleRegistry,
  };

  test("data() status/headers, component props and links() reach the document", async () => {
    const res = await handleRequest(req("http://x/gone"), trie, config, {});
    expect(res.status).toBe(410);
    expect(res.headers.get("X-Why")).toBe("archived");
    const html = await res.text();
    expect(html).toContain("gone:archived");
    expect(html).toContain('href="/icon.svg"');
  });

  test("/_data carries links", async () => {
    const res = await handleRequest(req("http://x/_data?path=/gone"), trie, config, {});
    const body = (await res.json()) as { links: Array<{ href: string }>; route: unknown };
    expect(body.route).toEqual({ why: "archived" });
    expect(body.links[0].href).toBe("/icon.svg");
  });

  test("HydrateFallback + clientLoader.hydrate SSRs the fallback (data-only)", async () => {
    const html = await (await handleRequest(req("http://x/hydrate"), trie, config, {})).text();
    expect(html).toContain("HYDRATE-FALLBACK");
    expect(html).not.toContain("REAL-COMPONENT");
    expect(html).toContain('"ssrMode":"data-only"');
  });

  test("an action's data() status and headers apply to the client-submit JSON", async () => {
    const res = await handleRequest(
      new Request("http://x/save", {
        method: "POST",
        headers: {
          "X-BractJS-Action": "1",
          Origin: "http://x",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "a=1",
      }),
      trie,
      config,
      {},
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Set-Cookie")).toContain("flash=1");
    expect(await res.json()).toEqual({ saved: true });
  });
});

// ── Responses & sessions ────────────────────────────────────────────────────

describe("redirectDocument / replace / sessions", () => {
  test("redirect helpers mark the response for the client router", () => {
    expect(redirectDocument("/other").headers.get("X-BractJS-Reload-Document")).toBe("1");
    expect(replace("/list").headers.get("X-BractJS-Replace")).toBe("1");
    expect(() => replace("https://evil.test")).toThrow(/unsafe Location/);
  });

  test("flash values are read once; unset and destroySession work", async () => {
    const storage = createCookieSession({ name: "s", secrets: ["0123456789abcdef"] });
    const s = await storage.getSession();
    s.flash("notice", "saved");
    s.set("user", "u1");
    const cookie = (await storage.commitSession(s)).split(";")[0];
    const s2 = await storage.getSession(cookie);
    expect(s2.has("notice")).toBe(true);
    expect(s2.get("notice")).toBe("saved");
    expect(s2.get("notice")).toBeUndefined();
    s2.unset("user");
    expect(s2.has("user")).toBe(false);
    expect(await storage.destroySession(s2)).toContain("Max-Age=0");
  });

  test("createCookieSessionStorage maps React Router cookie options", async () => {
    const { getSession, commitSession } = createCookieSessionStorage({
      cookie: { name: "__rr", secrets: ["0123456789abcdef"], sameSite: "lax", maxAge: 60 },
    });
    const header = await commitSession(await getSession());
    expect(header).toStartWith("__rr=");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=60");
  });
});

// ── Client helpers ──────────────────────────────────────────────────────────

describe("client helpers", () => {
  test("generatePath fills :params, optional segments and splats", () => {
    expect(generatePath("/posts/:id", { id: "a b" })).toBe("/posts/a%20b");
    expect(generatePath("/:lang?/about", {})).toBe("/about");
    expect(generatePath("/files/*", { "*": "a/b.txt" })).toBe("/files/a/b.txt");
    expect(() => generatePath("/posts/:id", {})).toThrow(/missing/);
  });

  test("normalizeSubmission handles objects, GET, JSON and FormData", () => {
    const post = normalizeSubmission({ a: 1, tags: ["x", "y"] }, { method: "post", action: "/save" });
    expect(post.method).toBe("POST");
    expect(String(post.body)).toBe("a=1&tags=x&tags=y");
    expect(post.formData?.getAll("tags")).toEqual(["x", "y"]);

    const get = normalizeSubmission({ q: "bun" }, { method: "get", action: "/search?old=1" });
    expect(get.url).toBe("/search?q=bun");
    expect(get.body).toBeNull();

    const json = normalizeSubmission(
      { id: 1 },
      { method: "post", action: "/api", encType: "application/json" },
    );
    expect(json.body).toBe('{"id":1}');
    expect(json.contentType).toBe("application/json");

    const fd = new FormData();
    fd.set("k", "v");
    expect(normalizeSubmission(fd, { method: "post", action: "/x" }).body).toBe(fd);
  });

  test("fetcherStore.reset clears data and formData", () => {
    fetcherStore.update("k1", { state: "idle", data: { a: 1 }, formMethod: "POST" });
    fetcherStore.reset("k1");
    expect(fetcherStore.get("k1")).toEqual({ key: "k1", state: "idle", data: undefined });
    fetcherStore.remove("k1");
  });

  test("createSearchParams expands arrays", () => {
    expect(createSearchParams({ a: ["1", "2"], b: "3" }).toString()).toBe("a=1&a=2&b=3");
  });
});

// ── SSR-renderable hooks/components ────────────────────────────────────────

function ctx(over: Partial<BractJSContextValue> = {}): BractJSContextValue {
  return { loaderData: {}, actionData: null, params: {}, pathname: "/", manifest: {}, ...over };
}
const render = (el: ReactElement, over?: Partial<BractJSContextValue>) =>
  renderToStaticMarkup(<BractJSProvider value={ctx(over)}>{el}</BractJSProvider>);

describe("SSR hooks and components", () => {
  test("useSearchParams destructures as a tuple and as an object", () => {
    function C() {
      const result = useSearchParams();
      const [sp, set] = result;
      return <p>{`${sp instanceof URLSearchParams}-${typeof set}-${result.searchParams === sp}`}</p>;
    }
    expect(render(<C />)).toContain("true-function-true");
  });

  test("route components receive loaderData props; <Outlet context> reaches useOutletContext", () => {
    function Route({ loaderData }: { loaderData?: { n: number } }) {
      const oc = useOutletContext<string>();
      return <p>{`n=${loaderData?.n} ctx=${oc}`}</p>;
    }
    const html = render(<Outlet context="shared" />, {
      loaderData: { route: { n: 5 } },
      RouteComponent: Route as never,
    });
    expect(html).toContain("n=5 ctx=shared");
  });

  test("useRouteLoaderData finds a match by id, with or without extension", () => {
    function C() {
      const root = useRouteLoaderData<{ user: string }>("root");
      return <p>{root?.user}</p>;
    }
    const matches = [{ id: "root.tsx", pathname: "/", params: {}, data: { user: "ada" }, handle: undefined }];
    expect(render(<C />, { matches })).toContain("ada");
  });

  test("useRouteError reads the boundary's error", () => {
    function Boundary() {
      const e = useRouteError();
      return <p>{isRouteErrorResponse(e) ? `status:${e.status}` : "other"}</p>;
    }
    expect(renderToStaticMarkup(renderErrorBoundary(Boundary, new HttpError(404)))).toContain("status:404");
  });

  test("useNavigation is idle during SSR", () => {
    function C() {
      const n = useNavigation();
      return <p>{`${n.state}-${n.formData === undefined}`}</p>;
    }
    expect(render(<C />)).toContain("idle-true");
  });

  test("NavLink marks the active link", () => {
    const html = render(
      <>
        <NavLink to="/blog">Blog</NavLink>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/blog/post" className={({ isActive }) => (isActive ? "on" : "off")}>
          Post
        </NavLink>
      </>,
      {
        pathname: "/blog/post",
        location: { pathname: "/blog/post", search: "", hash: "", state: null, key: "d" },
      },
    );
    expect(html).toContain('href="/blog" class="active" aria-current="page"');
    expect(html).toMatch(/href="\/"(?![^>]*active)/);
    expect(html).toContain('class="on"');
  });

  test("useHref / useResolvedPath / useFormAction resolve relative paths", () => {
    function C() {
      return <p>{`${useHref("edit")}|${useResolvedPath("../x?y=1").pathname}|${useFormAction()}`}</p>;
    }
    const html = render(<C />, {
      location: { pathname: "/posts/1", search: "?a=b", hash: "", state: null, key: "d" },
    });
    expect(html).toContain("/posts/edit|/x|/posts/1?a=b");
  });

  test("Await renders element children with useAsyncValue", async () => {
    function Value() {
      return <b>{useAsyncValue<string>()}</b>;
    }
    const p = Promise.resolve("resolved!");
    await p;
    const { renderToReadableStream } = await import("react-dom/server");
    const stream = await renderToReadableStream(
      <Await resolve={p} fallback={<i>loading</i>}>
        <Value />
      </Await>,
    );
    await stream.allReady;
    expect(await new Response(stream).text()).toContain("resolved!");
  });
});
