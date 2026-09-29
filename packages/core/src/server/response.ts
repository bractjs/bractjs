export interface RedirectOptions {
  /** Allow absolute URLs to other origins. Default false. */
  allowExternal?: boolean;
}

/** Object form of `redirect`'s second argument — the Remix / React Router shape. */
export interface RedirectInit extends RedirectOptions {
  /** Default 302. */
  status?: number;
  headers?: HeadersInit;
}

// Brand stamped onto redirect Responses the app explicitly opted into sending
// off-origin via `redirect(url, …, { allowExternal: true })`. sanitizeRedirect()
// (below) lets branded Responses through untouched but neutralizes any *other*
// 3xx whose Location escapes the request origin — e.g. a loader/action that
// throws a raw `new Response(null,{status:302,headers:{Location:"//evil"}})`,
// which would otherwise bypass this helper's guard entirely.
const ALLOW_EXTERNAL = Symbol.for("bractjs.redirect.allowExternal");

export function isSafeInternalRedirect(url: string): boolean {
  // Must be path-only: a single leading "/" that does not begin an authority
  // ("//host", "/\\host") or a scheme. Rejects, raw OR percent-encoded:
  //   "//evil.com", "/\\evil.com", "/%2f%2fevil.com", "/%5cevil.com",
  //   "https://…", "javascript:…", "" — plus any control/whitespace char that
  //   browsers strip or normalize ("/\t//evil", "/\n/evil") before resolving.
  if (url.length === 0) return false;
  // Reject any C0 control char, space, or DEL — browsers strip/normalize these
  // and can turn "/\t//evil" into a protocol-relative escape. Checked via char
  // code (not a regex with control-char literals) to keep the source portable.
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return false;
  }
  if (url[0] !== "/") return false;
  const rest = url.slice(1).toLowerCase();
  if (rest.startsWith("/") || rest.startsWith("\\")) return false;
  if (rest.startsWith("%2f") || rest.startsWith("%5c")) return false;
  return true;
}

/** Absolute or protocol-relative URL whose scheme is http/https. */
function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, "https://base.invalid");
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Build a redirect Response. The second argument is a status code or, as in
 * Remix / React Router, an init object:
 *
 *   redirect("/login")                                     // 302
 *   redirect("/login", 303, { "Set-Cookie": c })           // positional
 *   redirect("/login", { status: 303, headers: { "Set-Cookie": c } })
 */
export function redirect(
  url: string,
  init: number | RedirectInit = 302,
  headers?: HeadersInit,
  options?: RedirectOptions,
): Response {
  const status = typeof init === "number" ? init : (init.status ?? 302);
  if (typeof init !== "number") {
    options = { ...options, allowExternal: options?.allowExternal ?? init.allowExternal };
  }
  if (!options?.allowExternal && !isSafeInternalRedirect(url)) {
    throw new Error(
      `[bractjs] redirect: unsafe Location "${url}". ` +
        `Pass { allowExternal: true } to redirect off-origin.`,
    );
  }
  // SECURITY(medium): `allowExternal` opts into other *origins*, not other
  // schemes. The client router follows an action redirect with
  // location.assign(), where a `javascript:` Location would execute — so an
  // app that forwards user input here must not be able to turn an open
  // redirect into XSS.
  if (options?.allowExternal && !isSafeInternalRedirect(url) && !isHttpUrl(url)) {
    throw new Error(`[bractjs] redirect: Location "${url}" must be an http(s) URL.`);
  }
  const h = new Headers(typeof init === "number" ? headers : init.headers);
  if (typeof init !== "number" && headers) {
    new Headers(headers).forEach((value, key) => h.append(key, value));
  }
  h.set("Location", url);
  const res = new Response(null, { status, headers: h });
  // Brand opt-in external redirects so the global sanitizer trusts them.
  if (options?.allowExternal) (res as { [ALLOW_EXTERNAL]?: true })[ALLOW_EXTERNAL] = true;
  return res;
}

/**
 * React Router's `redirectDocument()`: a redirect the client router must follow
 * with a full document load instead of a soft navigation (e.g. to a part of the
 * site served by another app on the same origin). Same arguments and safety
 * checks as {@link redirect}.
 */
export function redirectDocument(url: string, init: number | RedirectInit = 302): Response {
  const res = redirect(url, init);
  res.headers.set("X-BractJS-Reload-Document", "1");
  return res;
}

/**
 * React Router's `replace()`: a redirect that replaces the current history
 * entry instead of pushing a new one when the client router follows it.
 * Same arguments and safety checks as {@link redirect}.
 */
export function replace(url: string, init: number | RedirectInit = 302): Response {
  const res = redirect(url, init);
  res.headers.set("X-BractJS-Replace", "1");
  return res;
}

/**
 * Last-line guard applied to every redirect Response the request handler is
 * about to emit. Returns the Response untouched unless it is a 3xx whose
 * `Location` escapes `requestUrl`'s origin AND it was not produced by
 * `redirect(..., { allowExternal: true })`. In that case the off-origin
 * Location is treated as an open-redirect attempt: it is logged and replaced
 * with a 500 so the client never follows it.
 */
export function sanitizeRedirect(res: Response, requestUrl: string): Response {
  if (res.status < 300 || res.status >= 400) return res;
  if ((res as { [ALLOW_EXTERNAL]?: true })[ALLOW_EXTERNAL]) return res;
  const loc = res.headers.get("Location");
  if (loc === null) return res;
  // Same-origin absolute Locations are fine; reduce to a path and re-check.
  let safe = isSafeInternalRedirect(loc);
  if (!safe) {
    try {
      safe = new URL(loc, requestUrl).origin === new URL(requestUrl).origin;
    } catch {
      safe = false;
    }
  }
  if (safe) return res;
  console.error(
    `[bractjs] blocked off-origin redirect Location "${loc}". ` +
      `Use redirect(url, status, headers, { allowExternal: true }) to opt in.`,
  );
  return error("Internal Server Error", 500);
}

export function json<T>(data: T, init?: ResponseInit): Response {
  const body = JSON.stringify(data);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function error(message: string, status: number = 500): Response {
  return json({ error: message }, { status });
}
