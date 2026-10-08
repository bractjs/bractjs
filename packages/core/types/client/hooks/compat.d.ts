import { type PathObject } from "../nav-utils.ts";
import { type RelativeRoutingType } from "./useResolveTo.ts";
/**
 * React Router's `useResolvedPath(to, { relative })`: `to` resolved against
 * the route this component renders under (`relative: "path"`: against the
 * URL's segments), as `{ pathname, search, hash }`. SSR-safe.
 */
export declare function useResolvedPath(to: string | Partial<PathObject>, options?: {
    relative?: RelativeRoutingType;
}): PathObject;
/** React Router's `useHref(to, { relative })`: the resolved URL string for `to`. */
export declare function useHref(to: string | Partial<PathObject>, options?: {
    relative?: RelativeRoutingType;
}): string;
/**
 * React Router's `useFormAction(action?, { relative })`: the URL a `<Form>`
 * posts to — `action` resolved like a link, or (no action) the current URL:
 * only the page's own route runs actions, so the default is always the page.
 */
export declare function useFormAction(action?: string, options?: {
    relative?: RelativeRoutingType;
}): string;
/**
 * React Router's `useNavigationType()`: how the current location was reached —
 * `"PUSH"`, `"REPLACE"`, or `"POP"` (initial load and back/forward).
 */
export declare function useNavigationType(): "POP" | "PUSH" | "REPLACE";
