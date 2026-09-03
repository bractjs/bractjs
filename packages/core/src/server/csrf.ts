/**
 * Cross-origin mutation protection for state-changing requests
 * (POST/PUT/DELETE/PATCH and the side-effecting /_action, /_stream endpoints).
 *
 * Defense in depth, in priority order:
 *
 * 1. `Sec-Fetch-Site` — set by the browser, NOT settable from JS (it's a
 *    forbidden request header). When present it is authoritative: only
 *    `same-origin` and `none` (direct navigation / address bar) are allowed;
 *    `cross-site` and `same-site` are rejected. This catches cross-origin
 *    forgeries even when the attacker controls the Origin header (non-browser
 *    clients) — those won't carry a trustworthy Sec-Fetch-Site.
 *
 * 2. `X-BractJS-Action` — a custom header the client RPC layer sets on every
 *    action call. Browsers block custom headers cross-origin without a CORS
 *    preflight, so its presence implies a same-origin (or explicitly
 *    CORS-allowed) caller.
 *
 * 3. `Origin` — must match the request URL's origin, or the origin implied by
 *    `X-Forwarded-Proto`/`X-Forwarded-Host` when the app sits behind a
 *    TLS-terminating reverse proxy (see {@link candidateOrigins} for why
 *    honoring those headers costs nothing here).
 *
 * A request is allowed only when Sec-Fetch-Site does not veto it AND at least
 * one of (2) or (3) holds. Non-browser clients (curl, server-to-server) send
 * none of these headers and are rejected by default — they must set
 * `X-BractJS-Action` or a same-origin `Origin` to mutate.
 */
// This gate protects server actions (/_action), streaming actions (/_stream),
// route mutations, AND typed /api routes (see api-route.ts) — every
// state-changing, cookie-trusting surface in the framework.
//
// SECURITY(medium): X-BractJS-Action acts as a CSRF token by relying on CORS
// preflight blocking custom headers cross-origin. This is safe only while the
// server does NOT emit a permissive Access-Control-Allow-Headers listing this
// header. The built-in cors() (middleware/cors.ts) deliberately omits it; if
// you ship your OWN CORS layer and expose this header cross-origin, you defeat
// CSRF everywhere — add a cryptographic double-submit token in that case.
// Sec-Fetch-Site (1) remains a browser-enforced backstop, but note it is NOT
// sent by every client/proxy: behind a header-stripping proxy the gate falls
// back to the same-origin Origin check, which cors() does not weaken.
import { isExplicitDev } from "./env.ts";

/**
 * The developer-facing explanation of a CSRF rejection. In dev it spells out
 * the accepted signals and the usual fix; in prod it stays terse so the 403
 * leaks nothing. Used for the plain route/action 403 bodies — the stream
 * handler embeds {@link csrfHint} in its SSE error event instead.
 */
export function csrfHint(): string {
  return (
    "Blocked a cross-site or unattributed mutation (CSRF protection). " +
    "Same-origin browser requests are allowed automatically; a manual fetch() " +
    "must send the header `X-BractJS-Action: 1` (BractJS's <Form> and " +
    "useFetcher do this for you)."
  );
}

/** A 403 Response for a rejected mutation: explanatory in dev, terse in prod. */
export function csrfForbiddenResponse(): Response {
  if (isExplicitDev()) {
    console.warn("[bractjs] 403 (CSRF): " + csrfHint());
    return new Response("Forbidden — " + csrfHint(), { status: 403 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** First value of a comma-separated forwarded header (`a, b, c` → `a`), trimmed. */
function firstForwarded(value: string | null): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

/**
 * The origins a same-origin `Origin` header may legitimately equal.
 *
 * Always includes the origin of `request.url`. Behind a reverse proxy that
 * terminates TLS (nginx, Caddy, Cloudflare, most PaaS routers), that origin is
 * wrong in a way that matters: Bun reconstructs `request.url` from the
 * forwarded `Host` over the *plain HTTP* hop, so it reads `http://app.example.com`
 * while the browser truthfully sends `Origin: https://app.example.com`. The
 * schemes differ, the strings don't match, and a legitimate same-origin POST is
 * rejected with a 403. That hit exactly one path — a plain `<Form>` submit
 * before hydration or with JS disabled — because the client router sets
 * `X-BractJS-Action` and passes at check (2) long before this comparison.
 *
 * So `X-Forwarded-Proto` / `X-Forwarded-Host` are folded in as *additional*
 * candidates. This does not widen the gate:
 *
 * - A browser cannot set either header cross-origin. Both are non-safelisted
 *   request headers, so a cross-site attempt needs a CORS preflight the
 *   framework never approves — the same property that makes check (2) work.
 * - A non-browser client that *can* set arbitrary headers is already through
 *   the gate via `X-BractJS-Action: 1`; forging `X-Forwarded-Proto` buys such a
 *   caller nothing it did not already have.
 * - `Sec-Fetch-Site` (1) still vetoes first, and it is browser-set and not
 *   forgeable from JS.
 *
 * The values are only ever compared against a browser-set `Origin`; nothing
 * here is used to *build* a URL the server will fetch or redirect to.
 */
function candidateOrigins(request: Request): string[] {
  const url = new URL(request.url);
  const origins = [url.origin];

  const proto = firstForwarded(request.headers.get("X-Forwarded-Proto"));
  const host = firstForwarded(request.headers.get("X-Forwarded-Host"));
  if (!proto && !host) return origins;

  // Only http/https are meaningful for a web origin; anything else is junk or
  // an injection attempt and is ignored in favor of the real scheme.
  const scheme = proto === "http" || proto === "https" ? proto : url.protocol.replace(":", "");
  try {
    origins.push(new URL(`${scheme}://${host ?? url.host}`).origin);
  } catch {
    // A malformed X-Forwarded-Host contributes no candidate; url.origin stands.
  }
  return origins;
}

export function isAllowedMutation(request: Request): boolean {
  // (1) Browser-enforced signal. If present, it vetoes cross-origin requests
  // regardless of what the Origin/custom headers claim.
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  // (2) Client-issued custom header (blocked cross-origin by CORS preflight).
  if (request.headers.get("X-BractJS-Action")) return true;

  // (3) Same-origin Origin header, tolerant of a TLS-terminating proxy.
  const origin = request.headers.get("Origin");
  if (!origin) {
    // No Origin header. Allow only when the browser explicitly told us this is
    // a same-origin / direct request via Sec-Fetch-Site; otherwise reject.
    return fetchSite === "same-origin" || fetchSite === "none";
  }
  try {
    const sent = new URL(origin).origin;
    return candidateOrigins(request).includes(sent);
  } catch {
    return false;
  }
}
