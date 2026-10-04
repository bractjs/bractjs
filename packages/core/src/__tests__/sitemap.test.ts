import { describe, expect, test } from "bun:test";
import { createMiddlewareContext } from "../server/middleware.ts";
import type { RouteFile } from "../server/scanner.ts";
import { collectSitemapEntries, registerSiteSource, renderSitemap, sitemap } from "../server/sitemap.ts";

const route = (filePath: string, segments: RouteFile["segments"]): RouteFile => ({
  filePath,
  urlPattern: segments.map((s) => (typeof s === "string" ? s : "*")).join("/"),
  segments,
});

const ROUTES: RouteFile[] = [
  route("routes/_index.tsx", []),
  route("routes/about.tsx", ["about"]),
  route("routes/blog/[slug].tsx", ["blog", { param: "slug" }]),
  route("routes/admin/_index.tsx", ["admin"]),
  route("routes/api/feed.tsx", ["api", "feed"]),
];

describe("collectSitemapEntries", () => {
  test("static routes, prerendered paths and extra(); dynamic routes and /api left out", async () => {
    const entries = await collectSitemapEntries(
      {
        origin: "https://example.com",
        exclude: ["/admin/*", "/admin"],
        extra: async () => ["/blog/hello", { path: "/about", priority: 0.8 }],
      },
      { routes: Promise.resolve(ROUTES), prerender: async () => ["/blog/intro/"] },
    );
    expect(entries).toEqual([
      { path: "/" },
      { path: "/about", priority: 0.8 },
      { path: "/blog/hello" },
      { path: "/blog/intro" },
    ]);
  });

  test("an exclude predicate", async () => {
    const entries = await collectSitemapEntries(
      { origin: "https://x.example", exclude: (p) => p !== "/" },
      { routes: Promise.resolve(ROUTES) },
    );
    expect(entries).toEqual([{ path: "/" }]);
  });
});

describe("renderSitemap", () => {
  test("absolute, escaped URLs with optional fields", () => {
    const xml = renderSitemap("https://example.com/", [
      { path: "/a&b", lastmod: "2026-10-04", changefreq: "weekly", priority: 0.5 },
    ]);
    expect(xml).toStartWith(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://example.com/a&amp;b</loc>");
    expect(xml).toContain("<lastmod>2026-10-04</lastmod>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>0.5</priority>");
  });

  test("i18n: one URL per locale, each with hreflang alternates", () => {
    const xml = renderSitemap("https://example.com", [{ path: "/about" }], {
      locales: ["en", "fr"],
      defaultLocale: "en",
    });
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<loc>https://example.com/fr/about</loc>");
    expect(xml.match(/hreflang="fr" href="https:\/\/example.com\/fr\/about"/g)).toHaveLength(2);
    expect(xml).toContain('hreflang="x-default" href="https://example.com/about"');
  });
});

describe("sitemap() middleware", () => {
  const call = async (mw: ReturnType<typeof sitemap>, path: string) => {
    const next = async () => new Response("next");
    return mw(createMiddlewareContext(new Request(`http://localhost${path}`)), next) as Promise<Response>;
  };

  test("answers /sitemap.xml and /robots.txt; passes everything else on", async () => {
    registerSiteSource({ routes: Promise.resolve(ROUTES) });
    const mw = sitemap({ origin: "https://example.com/some/path", robots: { disallow: ["/admin"] } });
    const xml = await call(mw, "/sitemap.xml");
    expect(xml.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(await xml.text()).toContain("<loc>https://example.com/about</loc>");
    const robots = await (await call(mw, "/robots.txt")).text();
    expect(robots).toBe("User-agent: *\nDisallow: /admin\n\nSitemap: https://example.com/sitemap.xml\n");
    expect(await (await call(mw, "/about")).text()).toBe("next");
  });

  test("robots: false leaves robots.txt to the app", async () => {
    const mw = sitemap({ origin: "https://example.com", robots: false });
    expect(await (await call(mw, "/robots.txt")).text()).toBe("next");
  });

  test("a relative origin is rejected up front", () => {
    expect(() => sitemap({ origin: "example.com" })).toThrow("origin must be an absolute URL");
  });
});
