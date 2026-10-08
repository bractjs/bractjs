import { type I18nConfig, splitLocale } from "../shared/i18n.ts";
import type { ServerManifest } from "../server/render.ts";
import { buildTrie, matchRoute, type TrieNode } from "../server/matcher.ts";
import type { RouteFile, Segment } from "../server/scanner.ts";

// ── Redirect normalization ─────────────────────────────────────────────────

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
export function toSamePath(loc: string): string | null {
  try {
    const u = new URL(loc, window.location.href);
    if (u.origin !== window.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Full-page navigation to an off-origin target (the `null` branch of
 * {@link toSamePath}). SECURITY(high): only http(s), mailto: and tel: targets
 * are followed — `location.assign("javascript:…")` would execute script in
 * this origin, turning an app-level open redirect or a user-supplied link into
 * XSS. Anything else is dropped.
 */
export function assignExternal(loc: string): void {
  let protocol: string;
  try {
    protocol = new URL(loc, window.location.href).protocol;
  } catch {
    protocol = "";
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
    console.error(`[bractjs] refused to navigate to "${loc}" (only http, https, mailto and tel)`);
    return;
  }
  window.location.assign(loc);
}

// ── Navigation target parsing ──────────────────────────────────────────────

/**
 * Split an internal navigation target ("/path", "/path?q", "/path#h",
 * "/path?q#h") into its parts. Callers must normalize absolute URLs through
 * `toSamePath()` first — this is a pure string split, not a URL parser.
 */
export function parseTo(to: string): { pathname: string; search: string; hash: string } {
  const hashIdx = to.indexOf("#");
  const hash = hashIdx === -1 ? "" : to.slice(hashIdx);
  const beforeHash = hashIdx === -1 ? to : to.slice(0, hashIdx);
  const searchIdx = beforeHash.indexOf("?");
  const search = searchIdx === -1 ? "" : beforeHash.slice(searchIdx);
  const pathname = searchIdx === -1 ? beforeHash : beforeHash.slice(0, searchIdx);
  return { pathname: pathname || "/", search, hash };
}

/** React Router's `Path` / `To` object form. */
export interface PathObject {
  pathname: string;
  search: string;
  hash: string;
}

/** A `to` that may be React Router's `{ pathname, search, hash }` object → a string. */
export function pathToString(to: string | Partial<PathObject>): string {
  if (typeof to === "string") return to;
  const search = to.search ? (to.search.startsWith("?") ? to.search : "?" + to.search) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : "#" + to.hash) : "";
  return (to.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/")) + search + hash;
}

/**
 * Resolve a relative target ("edit", "../posts", "?page=2", "#top") against the
 * current URL, the way the browser resolves an `<a href>`. Absolute paths pass
 * through; off-origin URLs come back unchanged (callers route them through
 * `toSamePath()`).
 */
export function resolveHref(to: string): string {
  if (to.startsWith("/") || typeof window === "undefined") return to;
  try {
    const u = new URL(to, window.location.href);
    if (u.origin !== window.location.origin) return to;
    return u.pathname + u.search + u.hash;
  } catch {
    return to;
  }
}

/** Random short key identifying a history entry (scroll restoration identity). */
export function createLocationKey(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

// ── /_data redirect envelope ───────────────────────────────────────────────

/**
 * The redirect target of a `/_data` (or action) response, or `null` when it
 * is a normal payload. The server never answers a fetch()-driven endpoint with
 * a raw 3xx — fetch would follow it opaquely to an HTML document — but with
 * `204 No Content` + `X-BractJS-Redirect: <location>`. Callers must check this
 * BEFORE `res.json()` (a 204 is `ok` and has no body) and route the target
 * through `toSamePath`/`assignExternal`, never straight into the router.
 */
export function dataRedirectTarget(res: Response): string | null {
  return res.headers.get("X-BractJS-Redirect");
}

// ── Pattern Matching ───────────────────────────────────────────────────────

/**
 * The client picks a route for a pathname with the SAME trie walk the server
 * uses (`server/matcher.ts` is pure: a type-only import of scanner.ts). A
 * separately-maintained scorer drifted — it let `[...slug]` match zero segments
 * and ranked `[org]/[repo]/[branch]` above `docs/[...slug]` for /docs/a/b — so
 * the wrong chunk hydrated against the server's data. Parity by construction.
 */

/** Manifest pattern syntax → scanner segments ("" is the index route). */
function patternSegments(pattern: string): Segment[] {
  if (pattern === "") return [];
  return pattern.split("/").map((seg) => {
    if (seg.startsWith("[...") && seg.endsWith("]")) return { catchAll: seg.slice(4, -1) };
    if (seg.startsWith("[[") && seg.endsWith("]]")) return { optional: seg.slice(2, -2) };
    if (seg.startsWith("[") && seg.endsWith("]")) return { param: seg.slice(1, -1) };
    return seg;
  });
}

// One trie per manifest, rebuilt when its route table changes (the dev server
// swaps routes in place on add/remove, so key on the pattern list, not identity).
const trieCache = new WeakMap<ServerManifest, { key: string; trie: TrieNode }>();

function trieFor(manifest: ServerManifest): TrieNode {
  const patterns = Object.keys(manifest.routes);
  const key = patterns.join("\n");
  const cached = trieCache.get(manifest);
  if (cached && cached.key === key) return cached.trie;
  const routes: RouteFile[] = patterns.map((p) => ({
    filePath: manifest.routes[p]?.file ?? p,
    urlPattern: p,
    segments: patternSegments(p),
  }));
  const trie = buildTrie(routes);
  trieCache.set(manifest, { key, trie });
  return trie;
}

// ── Export ─────────────────────────────────────────────────────────────────

/** Returns the manifest pattern the server would match for pathname, or null. */
export function matchPatternForPath(pathname: string, manifest: ServerManifest): string | null {
  // i18n: routes match the path without its locale prefix (as on the server).
  if (clientI18n) pathname = splitLocale(pathname, clientI18n).pathname;
  // Exact static match wins outright (most specific) — also a fast path.
  const normalized = pathname.replace(/^\//, "");
  if (normalized in manifest.routes) return normalized;
  return matchRoute(pathname, trieFor(manifest))?.routeFile.urlPattern ?? null;
}

// The app's i18n config, from the bootstrap payload (set once by the client entry).
let clientI18n: I18nConfig | null = null;

/** Called by the client entry with the payload's `i18n`. Not part of the public API. */
export function setClientI18n(i18n: I18nConfig | null | undefined): void {
  clientI18n = i18n ?? null;
}
