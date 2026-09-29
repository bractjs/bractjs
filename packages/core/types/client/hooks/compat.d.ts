import { type PathObject } from "../nav-utils.ts";
/**
 * React Router's `useResolvedPath(to)`: `to` resolved against the current
 * location, as `{ pathname, search, hash }`. SSR-safe (uses the request URL).
 */
export declare function useResolvedPath(to: string | Partial<PathObject>): PathObject;
/** React Router's `useHref(to)`: the resolved URL string for `to`. */
export declare function useHref(to: string | Partial<PathObject>): string;
/**
 * React Router's `useFormAction(action?)`: the URL a `<Form>` posts to —
 * `action` resolved against the current location, or the current URL.
 */
export declare function useFormAction(action?: string): string;
/**
 * React Router's `useNavigationType()`: how the current location was reached —
 * `"PUSH"`, `"REPLACE"`, or `"POP"` (initial load and back/forward).
 */
export declare function useNavigationType(): "POP" | "PUSH" | "REPLACE";
