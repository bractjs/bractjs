// React Router route-relative paths: a relative `to` / `action` resolves
// against the route the calling component renders under (root, a layout, the
// page), `..` climbs one ROUTE, `relative="path"` climbs URL segments.
import { describe, expect, test } from "bun:test";
import type { ComponentType, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Form } from "../client/components/Form.tsx";
import { Link } from "../client/components/Link.tsx";
import { NavLink } from "../client/components/NavLink.tsx";
import { Outlet } from "../client/components/Outlet.tsx";
import { useHref } from "../client/hooks/compat.ts";
import { resolveTo, routePathnamesFor } from "../client/nav-utils.ts";
import { NavigationContext, RouterContext, type RouterContextValue } from "../client/router.tsx";
import { BractJSProvider, type BractJSContextValue } from "../shared/context.ts";
import type { RouteMatch } from "../shared/route-types.ts";

const str = (to: string, rp: string[], loc: string, path = false) => {
  const p = resolveTo(to, rp, loc, path);
  return p.pathname + p.search + p.hash;
};

describe("resolveTo (port of React Router's)", () => {
  const cases: Array<[string, string[], string, boolean, string]> = [
    ["edit", ["/", "/posts/1"], "/posts/1", false, "/posts/1/edit"],
    ["./edit", ["/", "/posts/1"], "/posts/1", false, "/posts/1/edit"],
    // `..` climbs one ROUTE: with no posts/ layout the parent route is root.
    ["..", ["/", "/posts/1"], "/posts/1", false, "/"],
    ["..", ["/", "/posts", "/posts/1"], "/posts/1", false, "/posts"],
    ["../new", ["/", "/posts", "/posts/1"], "/posts/1", false, "/posts/new"],
    // relative="path": `..` drops one URL segment.
    ["..", ["/", "/posts/1"], "/posts/1", true, "/posts"],
    ["../x?y=1#z", ["/", "/posts/1"], "/posts/1", false, "/x?y=1#z"],
    // No pathname: the current location's.
    ["?q=1", ["/", "/posts"], "/posts/1", false, "/posts/1?q=1"],
    ["#top", ["/", "/posts"], "/posts/1", false, "/posts/1#top"],
    // "" / "." → the route itself; a trailing slash on the URL is kept for those.
    ["", ["/", "/posts"], "/posts/", false, "/posts/"],
    [".", ["/", "/posts"], "/posts", false, "/posts"],
    ["edit/", ["/", "/posts/1"], "/posts/1", false, "/posts/1/edit/"],
    // Past the root stays at "/".
    ["../../..", ["/", "/a"], "/a", false, "/"],
    ["/abs", ["/", "/a"], "/a", false, "/abs"],
  ];
  for (const [to, rp, loc, path, want] of cases) {
    test(`${JSON.stringify(to)} from ${rp.join(" › ")}${path ? " (path)" : ""} → ${want}`, () => {
      expect(str(to, rp, loc, path)).toBe(want);
    });
  }
});

describe("resolveTo never leaves the origin", () => {
  test("a crafted //host location doesn't turn ?q / #h / . into a protocol-relative URL", () => {
    expect(str("#c", ["/", "//evil.com/x"], "//evil.com/x")).toBe("/evil.com/x#c");
    expect(str("?page=2", ["/"], "//evil.com/x")).toBe("/evil.com/x?page=2");
    expect(str(".//evil.com", ["/"], "/")).toBe("/evil.com");
  });
});

describe("routePathnamesFor", () => {
  test("a leaf with its own (optional) path stays a route level when the segment is absent", () => {
    expect(
      routePathnamesFor(
        ["root.tsx", "routes/blog/layout.tsx", "routes/blog/[[page]].tsx"],
        "/blog",
        {},
        true,
      ),
    ).toEqual(["/", "/blog", "/blog"]);
  });

  test("layouts get the part of the URL their folder covers, encoding kept", () => {
    expect(
      routePathnamesFor(
        ["root.tsx", "routes/blog/layout.tsx", "routes/blog/[id].tsx"],
        "/blog/a%20b",
        { id: "a b" },
        true,
      ),
    ).toEqual(["/", "/blog", "/blog/a%20b"]);
  });
  test("route groups and index routes are pathless", () => {
    expect(
      routePathnamesFor(
        ["root.tsx", "routes/(g)/layout.tsx", "routes/(g)/blog/_index.tsx"],
        "/blog",
        {},
        true,
      ),
    ).toEqual(["/", "/blog"]);
    expect(
      routePathnamesFor(["root.tsx", "routes/blog/layout.tsx", "routes/blog/_index.tsx"], "/blog", {}, true),
    ).toEqual(["/", "/blog"]);
  });
  test("optional segments count only when present; splat leaf keeps the full path", () => {
    const ids = ["root.tsx", "routes/[[lang]]/layout.tsx", "routes/[[lang]]/docs/[...slug].tsx"];
    expect(routePathnamesFor(ids, "/docs/a/b", {}, true)).toEqual(["/", "/docs/a/b"]);
    expect(routePathnamesFor(ids, "/fr/docs/a/b", { lang: "fr" }, true)).toEqual([
      "/",
      "/fr",
      "/fr/docs/a/b",
    ]);
  });
});

// ── Components, through the real <Outlet> (SSR) ────────────────────────────

/** A scheme URL passes through untouched. */
function MailLink() {
  return <a href={useHref("mailto:a@b.c")}>mail</a>;
}

const hrefsOf = (html: string) => [...html.matchAll(/(?:href|action)="([^"]*)"/g)].map((m) => m[1]);

function app(opts: {
  pathname: string;
  matches: string[];
  params?: Record<string, string>;
  root: () => ReactElement;
  layout?: () => ReactElement;
  page: () => ReactElement;
  i18n?: BractJSContextValue["i18n"];
}): string {
  const matches: RouteMatch[] = opts.matches.map((id) => ({
    id,
    pathname: opts.pathname,
    params: opts.params ?? {},
    data: null,
    handle: undefined,
  }));
  const value: BractJSContextValue = {
    loaderData: { root: null, layouts: opts.layout ? [null] : [], route: null },
    actionData: null,
    params: opts.params ?? {},
    pathname: opts.pathname,
    manifest: {},
    RouteComponent: opts.page as ComponentType,
    LayoutModules: opts.layout ? [{ default: opts.layout as ComponentType }] : [],
    location: { pathname: opts.pathname, search: "", hash: "", state: null, key: "d" },
    matches,
    i18n: opts.i18n,
  };
  return renderToStaticMarkup(<BractJSProvider value={value}>{opts.root()}</BractJSProvider>);
}

describe("links and forms resolve against their own route", () => {
  test("root, layout and page each resolve 'new' and '..' from their level", () => {
    const html = app({
      pathname: "/blog/7",
      matches: ["root.tsx", "routes/blog/layout.tsx", "routes/blog/[id].tsx"],
      params: { id: "7" },
      root: () => (
        <main>
          <Link to="about">root</Link>
          <Outlet />
        </main>
      ),
      layout: () => (
        <section>
          <Link to="new">layout</Link>
          <Outlet />
        </section>
      ),
      page: () => (
        <>
          <Link to="edit">edit</Link>
          <Link to="..">up</Link>
          <Link to=".." relative="path">
            up-path
          </Link>
          <Form action="comments">x</Form>
          <MailLink />
        </>
      ),
    });
    expect(hrefsOf(html)).toEqual([
      "/about",
      "/blog/new",
      "/blog/7/edit",
      "/blog",
      "/blog",
      "/blog/7/comments",
      "mailto:a@b.c",
    ]);
  });

  test("without a blog/ layout, '..' from the page goes to root (React Router)", () => {
    const html = app({
      pathname: "/blog/7",
      matches: ["root.tsx", "routes/blog/[id].tsx"],
      params: { id: "7" },
      root: () => <Outlet />,
      page: () => (
        <>
          <Link to="..">up</Link>
          <Link to=".." relative="path">
            up-path
          </Link>
        </>
      ),
    });
    expect(hrefsOf(html)).toEqual(["/", "/blog"]);
  });

  test("absolute targets are untouched; NavLink compares the resolved path", () => {
    const html = app({
      pathname: "/blog/7",
      matches: ["root.tsx", "routes/blog/[id].tsx"],
      params: { id: "7" },
      root: () => <Outlet />,
      page: () => (
        <>
          <Link to="/x">abs</Link>
          <NavLink to=".">self</NavLink>
        </>
      ),
    });
    expect(hrefsOf(html)).toEqual(["/x", "/blog/7"]);
    expect(html).toContain('aria-current="page"');
  });

  test("i18n: a relative link stays in the current locale", () => {
    const html = app({
      pathname: "/fr/blog/7",
      matches: ["root.tsx", "routes/blog/layout.tsx", "routes/blog/[id].tsx"],
      params: { id: "7" },
      i18n: { locales: ["en", "fr"], defaultLocale: "en" },
      root: () => <Outlet />,
      layout: () => <Outlet />,
      page: () => (
        <>
          <Link to="edit">edit</Link>
          <Link to="..">up</Link>
        </>
      ),
    });
    expect(hrefsOf(html)).toEqual(["/fr/blog/7/edit", "/fr/blog"]);
  });
});

describe("client render (RouterContext) agrees with SSR", () => {
  function client(el: ReactElement, over: Partial<RouterContextValue>): string {
    const value = {
      loaderData: {},
      actionData: null,
      params: {},
      pathname: "/posts/1",
      location: { pathname: "/posts/1", search: "", hash: "", state: null, key: "k" },
      search: {},
      matches: [],
      manifest: { clientEntry: "/c.js", routes: {} },
      currentModule: null,
      currentLayouts: [],
      hydrationPending: false,
      ...over,
    } as unknown as RouterContextValue;
    return renderToStaticMarkup(
      <RouterContext.Provider value={value}>
        <NavigationContext.Provider value={{} as never}>{el}</NavigationContext.Provider>
      </RouterContext.Provider>,
    );
  }

  test("<Form action> renders the RESOLVED action on the client too (no hydration mismatch)", () => {
    expect(client(<Form action="edit">x</Form>, {})).toContain('action="/posts/1/edit"');
  });

  test("the SPA shell resolves against / until its route loads (like the server shell)", () => {
    function Q() {
      return <a href={useHref("?tab=1")}>q</a>;
    }
    expect(client(<Q />, { hydrationPending: "spa" })).toContain('href="/?tab=1"');
  });

  test("a crafted //host location still yields same-origin hrefs", () => {
    function H() {
      return <a href={useHref("#comments")}>h</a>;
    }
    const html = client(<H />, {
      location: { pathname: "//evil.com/x", search: "", hash: "", state: null, key: "k" },
    });
    expect(html).toContain('href="/evil.com/x#comments"');
  });
});
