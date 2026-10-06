import { type I18nConfig, localizePath } from "../shared/i18n.ts";
import type { MiddlewareFn } from "./middleware.ts";
import type { RouteFile } from "./scanner.ts";

// `sitemap()`: global middleware answering /sitemap.xml and /robots.txt from
// the app's own routes. The server registers what it knows about the app
// (registerSiteSource, from buildFetchHandler); the middleware reads it.

interface SiteSource {
  routes: Promise<RouteFile[]>;
  prerender?: string[] | (() => string[] | Promise<string[]>);
  i18n?: I18nConfig;
}

let source: SiteSource | null = null;

/** @internal Called by buildFetchHandler with the app it serves. */
export function registerSiteSource(next: SiteSource): void {
  source = next;
}

export interface SitemapEntry {
  path: string;
  /** ISO date (`2026-10-04`) or a Date. */
  lastmod?: string | Date;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  /** 0.0–1.0 */
  priority?: number;
}

export interface SitemapOptions {
  /** The public origin, e.g. `"https://example.com"` — sitemaps need absolute URLs. */
  origin: string;
  /**
   * More pages: the concrete paths of dynamic routes (`/blog/:slug`), which the
   * route table can't list. Called on every /sitemap.xml request (it's cached
   * for `maxAge`), so it can read a database.
   */
  extra?: () => Array<string | SitemapEntry> | Promise<Array<string | SitemapEntry>>;
  /** Paths to leave out: exact paths, prefixes ending in `/*`, or a predicate. */
  exclude?: Array<string> | ((path: string) => boolean);
  /** robots.txt: `false` leaves it to you; otherwise these rules plus a `Sitemap:` line. Default: allow everything. */
  robots?: false | { allow?: string[]; disallow?: string[] };
  /** Cache-Control max-age (seconds) for both files. Default 3600. */
  maxAge?: number;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

function staticPath(route: RouteFile): string | null {
  if (!route.segments.every((s) => typeof s === "string")) return null;
  const path = "/" + (route.segments as string[]).join("/");
  return path === "/" ? "/" : path.replace(/\/+$/, "");
}

function excluded(path: string, exclude: SitemapOptions["exclude"]): boolean {
  // Endpoints, not pages.
  if (path === "/api" || path.startsWith("/api/")) return true;
  if (!exclude) return false;
  if (typeof exclude === "function") return exclude(path);
  return exclude.some((rule) => (rule.endsWith("/*") ? path.startsWith(rule.slice(0, -1)) : path === rule));
}

/** The sitemap XML for `entries` (already filtered), with hreflang alternates under i18n. */
export function renderSitemap(origin: string, entries: SitemapEntry[], i18n?: I18nConfig): string {
  const base = origin.replace(/\/+$/, "");
  const urls: string[] = [];
  for (const entry of entries) {
    const locales = i18n ? i18n.locales : [undefined];
    for (const locale of locales) {
      const path = locale && i18n ? localizePath(entry.path, locale, i18n) : entry.path;
      const lines = [`    <loc>${xml(base + path)}</loc>`];
      if (i18n) {
        for (const alt of i18n.locales) {
          lines.push(
            `    <xhtml:link rel="alternate" hreflang="${xml(alt)}" href="${xml(base + localizePath(entry.path, alt, i18n))}"/>`,
          );
        }
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(base + localizePath(entry.path, i18n.defaultLocale, i18n))}"/>`,
        );
      }
      if (entry.lastmod) {
        const d = entry.lastmod instanceof Date ? entry.lastmod.toISOString() : entry.lastmod;
        lines.push(`    <lastmod>${xml(d)}</lastmod>`);
      }
      // Escaped like everything else: extra() entries often come from a database.
      if (entry.changefreq) lines.push(`    <changefreq>${xml(String(entry.changefreq))}</changefreq>`);
      const priority = Number(entry.priority);
      if (entry.priority !== undefined && Number.isFinite(priority)) {
        lines.push(`    <priority>${Math.min(1, Math.max(0, priority)).toFixed(1)}</priority>`);
      }
      urls.push(`  <url>\n${lines.join("\n")}\n  </url>`);
    }
  }
  const ns = i18n ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${urls.join("\n")}\n</urlset>\n`;
}

/** The pages to list: static routes, prerendered paths and `extra()`, deduplicated and sorted. */
export async function collectSitemapEntries(
  options: SitemapOptions,
  site: SiteSource | null = source,
): Promise<SitemapEntry[]> {
  const byPath = new Map<string, SitemapEntry>();
  const add = (entry: SitemapEntry) => {
    const path = entry.path === "/" ? "/" : entry.path.replace(/\/+$/, "");
    if (!path.startsWith("/") || excluded(path, options.exclude)) return;
    byPath.set(path, { ...byPath.get(path), ...entry, path });
  };
  if (site) {
    for (const route of await site.routes) {
      const path = staticPath(route);
      if (path) add({ path });
    }
    const prerender = typeof site.prerender === "function" ? await site.prerender() : (site.prerender ?? []);
    for (const path of prerender) add({ path });
  }
  for (const item of (await options.extra?.()) ?? []) add(typeof item === "string" ? { path: item } : item);
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Global middleware serving `/sitemap.xml` (every static page, every
 * prerendered path, and `extra()`, with hreflang alternates under i18n) and
 * `/robots.txt` pointing at it. Register it in `app/server.ts`:
 *
 *   pipeline.use(sitemap({ origin: "https://example.com", extra: async () => (await db.posts()).map((p) => `/blog/${p.slug}`) }));
 */
export function sitemap(options: SitemapOptions): MiddlewareFn {
  let origin: string;
  try {
    origin = new URL(options.origin).origin;
  } catch {
    throw new TypeError(
      `[bractjs] sitemap(): origin must be an absolute URL, got ${JSON.stringify(options.origin)}`,
    );
  }
  const maxAge = options.maxAge ?? 3600;
  let cached: { xml: string; at: number } | null = null;

  return async ({ request }, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    const { pathname } = new URL(request.url);
    if (pathname === "/sitemap.xml") {
      if (!cached || Date.now() - cached.at > maxAge * 1000) {
        cached = {
          xml: renderSitemap(origin, await collectSitemapEntries(options), source?.i18n),
          at: Date.now(),
        };
      }
      return new Response(cached.xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": `public, max-age=${maxAge}`,
        },
      });
    }
    if (pathname === "/robots.txt" && options.robots !== false) {
      const rules = options.robots ?? {};
      const lines = ["User-agent: *"];
      for (const p of rules.disallow ?? []) lines.push(`Disallow: ${p}`);
      for (const p of rules.allow ?? []) lines.push(`Allow: ${p}`);
      if (!rules.disallow?.length && !rules.allow?.length) lines.push("Allow: /");
      lines.push("", `Sitemap: ${origin}/sitemap.xml`, "");
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": `public, max-age=${maxAge}`,
        },
      });
    }
    return next();
  };
}
