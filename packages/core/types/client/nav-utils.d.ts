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
 * Split an internal navigation target ("/path", "/path?q", "/path#h",
 * "/path?q#h") into its parts. Callers must normalize absolute URLs through
 * `toSamePath()` first — this is a pure string split, not a URL parser.
 */
export declare function parseTo(to: string): {
    pathname: string;
    search: string;
    hash: string;
};
/** Random short key identifying a history entry (scroll restoration identity). */
export declare function createLocationKey(): string;
/** Returns the highest-priority manifest pattern that matches pathname, or null. */
export declare function matchPatternForPath(pathname: string, manifest: ServerManifest): string | null;
