import { type I18nConfig, splitLocale } from "../shared/i18n.ts";
import type { ServerManifest } from "../server/render.ts";
import { buildTrie, matchRoute, type TrieNode } from "../server/matcher.ts";
import { filePathToPattern, pathToSegments, type RouteFile } from "../shared/route-patterns.ts";

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

// ── Relative paths (React Router semantics) ────────────────────────────────

/** Like React Router's `parsePath`: no pathname key when the string has none ("?q", "#h", ""). */
function parsePathRR(to: string): Partial<PathObject> {
  const out: Partial<PathObject> = {};
  let rest = to;
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    out.hash = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  const searchIdx = rest.indexOf("?");
  if (searchIdx >= 0) {
    out.search = rest.slice(searchIdx);
    rest = rest.slice(0, searchIdx);
  }
  if (rest) out.pathname = rest;
  return out;
}

function normalizeSearch(search = ""): string {
  return !search || search === "?" ? "" : search.startsWith("?") ? search : "?" + search;
}

function normalizeHash(hash = ""): string {
  return !hash || hash === "#" ? "" : hash.startsWith("#") ? hash : "#" + hash;
}

function resolvePathname(relativePath: string, fromPathname: string): string {
  const segments = fromPathname.replace(/\/+$/, "").split("/");
  for (const segment of relativePath.split("/")) {
    if (segment === "..") {
      // Keep the leading "" (the root): `..` past the root stays at "/".
      if (segments.length > 1) segments.pop();
    } else if (segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.length > 1 ? segments.join("/") : "/";
}

/**
 * React Router's `resolveTo`: resolve a relative `to` against the route
 * hierarchy, not the URL. `routePathnames` are the pathnames of the matched
 * routes that contribute a path, outermost first (root "/" … the current
 * route); `..` climbs one ROUTE (`relative="route"`, the default) or one URL
 * segment (`isPathRelative`, `relative="path"`). A `to` with no pathname
 * (`?q`, `#h`) keeps the current location's pathname. Absolute paths pass
 * through.
 */
export function resolveTo(
  toArg: string | Partial<PathObject>,
  routePathnames: string[],
  locationPathname: string,
  isPathRelative = false,
): PathObject {
  const to: Partial<PathObject> = typeof toArg === "string" ? parsePathRR(toArg) : { ...toArg };
  const isEmptyPath = toArg === "" || to.pathname === "";
  const toPathname = isEmptyPath ? "/" : to.pathname;

  let from: string;
  if (toPathname == null) {
    from = locationPathname;
  } else {
    let routeIndex = routePathnames.length - 1;
    // Leading `..` segments climb the route hierarchy, one route each.
    if (!isPathRelative && toPathname.startsWith("..")) {
      const toSegments = toPathname.split("/");
      while (toSegments[0] === "..") {
        toSegments.shift();
        routeIndex -= 1;
      }
      to.pathname = toSegments.join("/");
    }
    from = routeIndex >= 0 ? routePathnames[routeIndex] : "/";
  }

  const rel = to.pathname;
  // A relative target never leaves the origin: repeated leading slashes (a
  // crafted `//host` location, `.//host`) collapse to one.
  const pathname = (rel ? (rel.startsWith("/") ? rel : resolvePathname(rel, from)) : from).replace(
    /^\/{2,}/,
    "/",
  );
  const path: PathObject = { pathname, search: normalizeSearch(to.search), hash: normalizeHash(to.hash) };
  // Trailing slashes: kept when `to` has one, or for "." / "" when the current URL has one.
  const explicitTrailing = !!toPathname && toPathname !== "/" && toPathname.endsWith("/");
  const currentTrailing = (isEmptyPath || toPathname === ".") && locationPathname.endsWith("/");
  if (!path.pathname.endsWith("/") && (explicitTrailing || currentTrailing)) path.pathname += "/";
  return path;
}

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
export function routePathnamesFor(
  ids: readonly string[],
  locationPathname: string,
  params: Record<string, string | undefined>,
  lastIsLeaf: boolean,
): string[] {
  const urlSegments = locationPathname.split("/").filter(Boolean);
  const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const out: string[] = [];
  ids.forEach((rawId, i) => {
    let pathname: string;
    if (i === 0) {
      pathname = "/";
    } else if (lastIsLeaf && i === ids.length - 1) {
      pathname = locationPathname;
      // A leaf with a path of its own (an absent `[[page]]` included) is a route
      // level of its own, as in React Router; only an index route is pathless.
      if (out.length > 0 && !/(?:^|\/)_index(?:\.mdx)?\.tsx?$/.test(rawId)) {
        out.push(pathname);
        return;
      }
    } else {
      // `routes/blog/layout.tsx` covers what its folder's index route would.
      const dir = /^(.*)\/layout\.tsx?$/.exec(rawId.split("\\").join("/"))?.[1];
      if (!dir) return; // unknown module id: contributes no path
      let consumed = 0;
      for (const seg of pathToSegments(filePathToPattern(`${dir}/_index.tsx`))) {
        if (typeof seg === "string" || "param" in seg) consumed += 1;
        else if ("optional" in seg) consumed += params[seg.optional] === undefined ? 0 : 1;
        else consumed = urlSegments.length;
      }
      pathname = "/" + urlSegments.slice(0, consumed).join("/");
    }
    if (out.length > 0 && trim(out[out.length - 1]) === trim(pathname)) return;
    out.push(pathname);
  });
  return out;
}

/** Random short key identifying a history entry (scroll restoration identity). */
/**
 * The body of an action response. JSON when it says so; a plain-text reply
 * (the framework's 403 CSRF / 413 / `rateLimit()` 429 bodies) used to be fed
 * to `res.json()` and threw a SyntaxError instead of reaching the form.
 */
export async function readActionBody(res: Response): Promise<unknown> {
  const type = res.headers.get("Content-Type") ?? "";
  if (/\bjson\b/i.test(type)) return res.json();
  const text = await res.text();
  if (res.status >= 400) return { error: text || res.statusText || `HTTP ${res.status}` };
  return text === "" ? null : text;
}

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
    segments: pathToSegments(p),
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
  if (Object.hasOwn(manifest.routes, normalized)) return normalized;
  return matchRoute(pathname, trieFor(manifest))?.routeFile.urlPattern ?? null;
}

// The app's i18n config, from the bootstrap payload (set once by the client entry).
let clientI18n: I18nConfig | null = null;

/** Called by the client entry with the payload's `i18n`. Not part of the public API. */
export function setClientI18n(i18n: I18nConfig | null | undefined): void {
  clientI18n = i18n ?? null;
}
