/**
 * Server-render coverage for the client hooks and components.
 *
 * These modules were previously untested: they live under `src/client/`, so the
 * reflex is that they need a DOM. Most of them don't — the hooks read context
 * that SSR populates, and the components' first and most consequential output is
 * the HTML the server streams. `renderToStaticMarkup` exercises exactly that
 * path with no new dependency and no harness.
 *
 * What is deliberately NOT here: anything whose behavior only exists after
 * hydration (`useNavigate`, `useFetcher`, `useBlocker`, `useRevalidator`,
 * prefetch, scroll restoration's scroll handling). Those need a real DOM; the
 * SSR half of their contract — that they render without throwing and emit the
 * right markup — is covered below.
 */
import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Await } from "../client/components/Await.tsx";
import { Link } from "../client/components/Link.tsx";
import { Outlet } from "../client/components/Outlet.tsx";
import { Scripts } from "../client/components/Scripts.tsx";
import { useActionData } from "../client/hooks/useActionData.ts";
import { useLoaderData } from "../client/hooks/useLoaderData.ts";
import { useLocale } from "../client/hooks/useLocale.ts";
import { useLocalizedLink } from "../client/hooks/useLocalizedLink.ts";
import { useLocation } from "../client/hooks/useLocation.ts";
import { useMatches } from "../client/hooks/useMatches.ts";
import { useNavigation } from "../client/hooks/useNavigation.ts";
import { useParams } from "../client/hooks/useParams.ts";
import { defer } from "../shared/deferred.ts";
import { BractJSProvider, type BractJSContextValue, useBractJSContext } from "../shared/context.ts";

/** A BractJSContextValue with only the fields a given test cares about set. */
function ctx(over: Partial<BractJSContextValue> = {}): BractJSContextValue {
  return {
    loaderData: {},
    actionData: null,
    params: {},
    pathname: "/",
    manifest: {},
    ...over,
  };
}

/** Server-render `el` inside a provider and return the markup. */
function ssr(el: ReactElement, value: BractJSContextValue = ctx()): string {
  return renderToStaticMarkup(<BractJSProvider value={value}>{el}</BractJSProvider>);
}

describe("hooks read SSR context", () => {
  test("useLoaderData returns the route's slice, not the whole chain", () => {
    function Probe() {
      const data = useLoaderData<{ title: string }>();
      return <p>{data.title}</p>;
    }
    const html = ssr(<Probe />, ctx({ loaderData: { root: { user: "u" }, route: { title: "Post" } } }));
    expect(html).toBe("<p>Post</p>");
  });

  test("useLoaderData does not throw when the route slice is absent", () => {
    function Probe() {
      const data = useLoaderData<{ title?: string }>();
      return <p>{data?.title ?? "none"}</p>;
    }
    expect(ssr(<Probe />)).toBe("<p>none</p>");
  });

  test("useActionData is null on a plain GET render", () => {
    function Probe() {
      return <p>{String(useActionData())}</p>;
    }
    expect(ssr(<Probe />)).toBe("<p>null</p>");
  });

  test("useActionData surfaces an action result when the server put one in context", () => {
    function Probe() {
      const data = useActionData<{ error: string }>();
      return <p>{data?.error}</p>;
    }
    expect(ssr(<Probe />, ctx({ actionData: { error: "Title required" } }))).toBe("<p>Title required</p>");
  });

  test("useParams returns the matched segments", () => {
    function Probe() {
      const { id } = useParams<{ id: string }>();
      return <p>{id}</p>;
    }
    expect(ssr(<Probe />, ctx({ params: { id: "42" } }))).toBe("<p>42</p>");
  });

  test("useLocation prefers the context location over the bare pathname", () => {
    function Probe() {
      const loc = useLocation();
      return <p>{`${loc.pathname}|${loc.search}|${loc.key}`}</p>;
    }
    const withLocation = ctx({
      pathname: "/ignored",
      location: { pathname: "/blog", search: "?page=2", hash: "", state: null, key: "k1" },
    });
    expect(ssr(<Probe />, withLocation)).toBe("<p>/blog|?page=2|k1</p>");
  });

  test("useLocation falls back to pathname with an empty search/hash", () => {
    function Probe() {
      const loc = useLocation();
      return <p>{`${loc.pathname}|${loc.search}|${loc.hash}|${loc.key}`}</p>;
    }
    expect(ssr(<Probe />, ctx({ pathname: "/about" }))).toBe("<p>/about|||default</p>");
  });

  test("useNavigation is idle during SSR (there is no in-flight navigation)", () => {
    function Probe() {
      return <p>{useNavigation().state}</p>;
    }
    expect(ssr(<Probe />)).toBe("<p>idle</p>");
  });

  test("useMatches exposes the matched chain root → route", () => {
    function Probe() {
      return (
        <p>
          {useMatches()
            .map((m) => m.id)
            .join(">")}
        </p>
      );
    }
    const matches = ctx({
      matches: [
        { id: "root.tsx", pathname: "/blog/7", params: { id: "7" }, data: {}, handle: undefined },
        { id: "routes/blog/[id].tsx", pathname: "/blog/7", params: { id: "7" }, data: {}, handle: undefined },
      ],
    });
    expect(ssr(<Probe />, matches)).toBe("<p>root.tsx&gt;routes/blog/[id].tsx</p>");
  });

  test("useMatches is an empty array when the server sent no chain", () => {
    function Probe() {
      return <p>{useMatches().length}</p>;
    }
    expect(ssr(<Probe />)).toBe("<p>0</p>");
  });

  test("useLocale reads the :locale param and falls back to the default", () => {
    function Probe() {
      return <p>{useLocale()}</p>;
    }
    expect(ssr(<Probe />, ctx({ params: { locale: "fr" } }))).toBe("<p>fr</p>");
    expect(ssr(<Probe />)).toBe("<p>en</p>");
  });

  test("useLocalizedLink prefixes a path once and never twice", () => {
    function Probe() {
      const link = useLocalizedLink();
      return <p>{`${link("/about")}|${link("/fr/about")}|${link("/fr")}|${link("about")}`}</p>;
    }
    const html = ssr(<Probe />, ctx({ params: { locale: "fr" } }));
    expect(html).toBe("<p>/fr/about|/fr/about|/fr|/fr/about</p>");
  });

  test("useBractJSContext throws outside a provider rather than returning undefined", () => {
    function Probe() {
      useBractJSContext();
      return null;
    }
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/within a BractJSProvider/);
  });
});

describe("<Link> server output", () => {
  test("renders a plain anchor for a static path", () => {
    expect(ssr(<Link to="/about">About</Link>)).toBe('<a href="/about">About</a>');
  });

  test("substitutes :params and URL-encodes the values", () => {
    const html = ssr(
      <Link to="/blog/:id" params={{ id: "a b/c" }}>
        Post
      </Link>,
    );
    expect(html).toContain('href="/blog/a%20b%2Fc"');
  });

  test("serializes search params onto the href", () => {
    const html = ssr(
      <Link to="/blog" search={{ page: 2 } as Record<string, unknown>}>
        Page 2
      </Link>,
    );
    expect(html).toContain('href="/blog?page=2"');
  });

  test("framework-only props never leak into the DOM", () => {
    const html = ssr(
      <Link to="/about" prefetch="intent" replace viewTransition className="nav">
        About
      </Link>,
    );
    expect(html).toContain('class="nav"');
    for (const leaked of ["prefetch=", "replace=", "viewTransition=", "params="]) {
      expect(html).not.toContain(leaked);
    }
  });

  test("passes through arbitrary anchor attributes", () => {
    const html = ssr(
      <Link to="/about" id="about-link" aria-label="About us" target="_blank">
        About
      </Link>,
    );
    expect(html).toContain('id="about-link"');
    expect(html).toContain('aria-label="About us"');
    expect(html).toContain('target="_blank"');
  });
});

describe("<Outlet> server output", () => {
  test("renders the matched route component from SSR context", () => {
    const html = ssr(<Outlet />, ctx({ RouteComponent: () => <main>route body</main> }));
    expect(html).toBe("<main>route body</main>");
  });

  test("renders nothing when no route component is present", () => {
    expect(ssr(<Outlet />)).toBe("");
  });
});

describe("<Scripts>", () => {
  test("is a marker that emits no markup (the stream injects the real tags)", () => {
    expect(ssr(<Scripts />)).toBe("");
  });
});

describe("<Await> server output", () => {
  // renderToStaticMarkup is synchronous, so it can never resolve a promise —
  // <Await> must degrade to its fallback rather than throw. The resolved path is
  // a streaming concern and is covered by deferred.test.ts.
  test("renders the fallback for a Deferred under synchronous rendering", () => {
    // defer() takes an object of promises and returns Deferred-wrapped fields;
    // <Await resolve> takes one of those fields.
    const { count } = defer({ count: Promise.resolve(3) });
    const html = renderToStaticMarkup(
      <Await resolve={count} fallback={<p>loading</p>}>
        {(value: number) => <p>{value}</p>}
      </Await>,
    );
    expect(html).toBe("<p>loading</p>");
  });

  test("accepts a bare promise as well as a Deferred", () => {
    const html = renderToStaticMarkup(
      <Await resolve={Promise.resolve("hi")} fallback={<p>loading</p>}>
        {(data: string) => <p>{data}</p>}
      </Await>,
    );
    expect(html).toBe("<p>loading</p>");
  });
});
