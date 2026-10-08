import { type I18nConfig } from "../shared/i18n.ts";
import type { ServerManifest } from "../server/render.ts";
/**
 * Normalize a Location/redirect target to a same-origin path the client router
 * can match. Returns an internal "/path?query#hash" for same-origin targets, or
 * `null` for off-origin, protocol-relative, or malformed values — the caller
 * MUST NOT feed a null result to the SPA router (an off-origin Location should
 * trigger a full-page navigation instead, so the browser applies its own
 * cross-origin protections). This is the client-side complement to the server's
 * `sanitizeRedirect()`: it stops a soft-nav from silently following an
 * attacker-controlled `Location` header.
 */
export declare function toSamePath(loc: string): string | null;
/**
 * Full-page navigation to an off-origin target (the `null` branch of
 * {@link toSamePath}). SECURITY(high): only http(s), mailto: and tel: targets
 * are followed — `location.assign("javascript:…")` would execute script in
 * this origin, turning an app-level open redirect or a user-supplied link into
 * XSS. Anything else is dropped.
 */
export declare function assignExternal(loc: string): void;
/**
 * Split an internal navigation target ("/path", "/path?q", "/path#h",
 * "/path?q#h") into its parts. Callers must normalize absolute URLs through
 * `toSamePath()` first — this is a pure string split, not a URL parser.
 */
export declare function parseTo(to: string): {
    pathname: string;
    search: string;
    hash: string;
};
/** React Router's `Path` / `To` object form. */
export interface PathObject {
    pathname: string;
    search: string;
    hash: string;
}
/** A `to` that may be React Router's `{ pathname, search, hash }` object → a string. */
export declare function pathToString(to: string | Partial<PathObject>): string;
/**
 * Resolve a relative target ("edit", "../posts", "?page=2", "#top") against the
 * current URL, the way the browser resolves an `<a href>`. Absolute paths pass
 * through; off-origin URLs come back unchanged (callers route them through
 * `toSamePath()`).
 */
export declare function resolveHref(to: string): string;
/**
 * React Router's `resolveTo`: resolve a relative `to` against the route
 * hierarchy, not the URL. `routePathnames` are the pathnames of the matched
 * routes that contribute a path, outermost first (root "/" … the current
 * route); `..` climbs one ROUTE (`relative="route"`, the default) or one URL
 * segment (`isPathRelative`, `relative="path"`). A `to` with no pathname
 * (`?q`, `#h`) keeps the current location's pathname. Absolute paths pass
 * through.
 */
export declare function resolveTo(toArg: string | Partial<PathObject>, routePathnames: string[], locationPathname: string, isPathRelative?: boolean): PathObject;
/**
 * The pathname each matched module contributes, for {@link resolveTo}:
 * `ids` are `useMatches()` ids (appDir-relative files), outermost first, cut
 * at the calling component's level; `lastIsLeaf` when that is the route
 * itself, which resolves against the whole (locale-free) location pathname —
 * splat segments included, as in React Router. A layout gets the part of the
 * URL its folder covers, taken from the URL itself (so encoding is kept, and
 * decoded params never leak into hrefs). Pathless entries — route-group
 * layouts, an index route below its folder's layout — collapse into the
 * previous one, like React Router's path-contributing matches.
 */
export declare function routePathnamesFor(ids: readonly string[], locationPathname: string, params: Record<string, string | undefined>, lastIsLeaf: boolean): string[];
/** Random short key identifying a history entry (scroll restoration identity). */
export declare function createLocationKey(): string;
/**
 * The redirect target of a `/_data` (or action) response, or `null` when it
 * is a normal payload. The server never answers a fetch()-driven endpoint with
 * a raw 3xx — fetch would follow it opaquely to an HTML document — but with
 * `204 No Content` + `X-BractJS-Redirect: <location>`. Callers must check this
 * BEFORE `res.json()` (a 204 is `ok` and has no body) and route the target
 * through `toSamePath`/`assignExternal`, never straight into the router.
 */
export declare function dataRedirectTarget(res: Response): string | null;
/** Returns the manifest pattern the server would match for pathname, or null. */
export declare function matchPatternForPath(pathname: string, manifest: ServerManifest): string | null;
/** Called by the client entry with the payload's `i18n`. Not part of the public API. */
export declare function setClientI18n(i18n: I18nConfig | null | undefined): void;
