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
 * 3. `Origin` — must match the request URL's origin.
 *
 * A request is allowed only when Sec-Fetch-Site does not veto it AND at least
 * one of (2) or (3) holds. Non-browser clients (curl, server-to-server) send
 * none of these headers and are rejected by default — they must set
 * `X-BractJS-Action` or a same-origin `Origin` to mutate.
 */
// SECURITY(medium): X-BractJS-Action acts as a CSRF token by relying on CORS
// preflight blocking custom headers cross-origin. This is safe only while the
// server does NOT emit a permissive Access-Control-Allow-Headers listing this
// header. If CORS policy is ever loosened, Sec-Fetch-Site (1) remains as the
// browser-enforced backstop, and apps that loosen CORS should add a
// cryptographic double-submit token.
export function isAllowedMutation(request: Request): boolean {
  // (1) Browser-enforced signal. If present, it vetoes cross-origin requests
  // regardless of what the Origin/custom headers claim.
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  // (2) Client-issued custom header (blocked cross-origin by CORS preflight).
  if (request.headers.get("X-BractJS-Action")) return true;

  // (3) Same-origin Origin header.
  const origin = request.headers.get("Origin");
  if (!origin) {
    // No Origin header. Allow only when the browser explicitly told us this is
    // a same-origin / direct request via Sec-Fetch-Site; otherwise reject.
    return fetchSite === "same-origin" || fetchSite === "none";
  }
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
