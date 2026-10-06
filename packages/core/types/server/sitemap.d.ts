import { type I18nConfig } from "../shared/i18n.ts";
import type { MiddlewareFn } from "./middleware.ts";
import type { RouteFile } from "./scanner.ts";
interface SiteSource {
    routes: Promise<RouteFile[]>;
    prerender?: string[] | (() => string[] | Promise<string[]>);
    i18n?: I18nConfig;
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
    robots?: false | {
        allow?: string[];
        disallow?: string[];
    };
    /** Cache-Control max-age (seconds) for both files. Default 3600. */
    maxAge?: number;
}
/** The sitemap XML for `entries` (already filtered), with hreflang alternates under i18n. */
export declare function renderSitemap(origin: string, entries: SitemapEntry[], i18n?: I18nConfig): string;
/** The pages to list: static routes, prerendered paths and `extra()`, deduplicated and sorted. */
export declare function collectSitemapEntries(options: SitemapOptions, site?: SiteSource | null): Promise<SitemapEntry[]>;
/**
 * Global middleware serving `/sitemap.xml` (every static page, every
 * prerendered path, and `extra()`, with hreflang alternates under i18n) and
 * `/robots.txt` pointing at it. Register it in `app/server.ts`:
 *
 *   pipeline.use(sitemap({ origin: "https://example.com", extra: async () => (await db.posts()).map((p) => `/blog/${p.slug}`) }));
 */
export declare function sitemap(options: SitemapOptions): MiddlewareFn;
export {};
