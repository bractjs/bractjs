import type { LinkDescriptor, MetaDescriptor } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";
type Params = Record<string, string>;
/** Request-level inputs for `meta()` beyond the loader data. */
export interface MetaContext {
    pathname: string;
    /** Raw query string including `?`, or `""`. */
    search?: string;
    /** The route loader's error, when it failed (passed to root/layout meta). */
    error?: unknown;
}
/**
 * Calls each route module's meta() in layout chain order (root → layouts → route),
 * passing the appropriate loaderData slice + params to each — plus the React
 * Router 7 arguments (`data`, `location`, `matches` with each ancestor's
 * resolved `meta`), so ported `meta` functions work unchanged.
 */
export declare function resolveMeta(chain: LayoutChain, loaderData: LoaderResults, params: Params, ctx?: MetaContext): MetaDescriptor[];
/**
 * Collect every module's `links()` export (root → layouts → route), deduped by
 * `rel` + `href` (first wins). A throwing `links()` is logged and skipped — a
 * broken preload hint must not take the page down.
 */
export declare function resolveLinks(chain: LayoutChain): LinkDescriptor[];
/**
 * Deduplicates descriptors: for same `name` or `property`, last-writer wins.
 * Title: last `{ title }` descriptor wins.
 */
export declare function mergeMeta(descriptors: MetaDescriptor[]): MetaDescriptor[];
/** Returns HTML string of <title> and <meta> tags for SSR head injection. */
export declare function renderMetaTags(descriptors: MetaDescriptor[]): string;
export {};
