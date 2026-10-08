import { type PathObject } from "../nav-utils.ts";
/** React Router's `relative` option: climb routes (default) or URL segments. */
export type RelativeRoutingType = "route" | "path";
/** Turns a link target into the URL to use: absolute and external targets unchanged. */
export type ResolveToFn = (to: string | Partial<PathObject>, relative?: RelativeRoutingType) => string;
/**
 * Resolve link and form targets the way React Router does: a relative `to`
 * ("edit", "../list", "?page=2") is relative to the ROUTE the calling
 * component renders under — root.tsx, a layout, or the page — not to the
 * URL's last segment. `..` climbs one route (`relative="path"`: one URL
 * segment). Under i18n the result stays in the current locale.
 *
 * Returns a stable function rather than a string: several callers only learn
 * their target at event time (a submitter's `formaction`, `useSubmit` options,
 * `navigate(to)`). SSR-safe; with no matched routes it resolves against the
 * current pathname.
 */
export declare function useResolveTo(): ResolveToFn;
