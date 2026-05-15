export interface RedirectOptions {
  /** Allow absolute URLs to other origins. Default false. */
  allowExternal?: boolean;
}

function isSafeInternalRedirect(url: string): boolean {
  // Must be path-only: single leading "/" not followed by "/" or "\".
  // Rejects: "//evil.com", "/\\evil.com", "https://...", "javascript:...", "".
  if (url.length === 0) return false;
  if (url[0] !== "/") return false;
  if (url[1] === "/" || url[1] === "\\") return false;
  return true;
}

export function redirect(
  url: string,
  status: number = 302,
  headers?: HeadersInit,
  options?: RedirectOptions,
): Response {
  if (!options?.allowExternal && !isSafeInternalRedirect(url)) {
    throw new Error(
      `[bractjs] redirect: unsafe Location "${url}". ` +
        `Pass { allowExternal: true } to redirect off-origin.`,
    );
  }
  const h = new Headers(headers);
  h.set("Location", url);
  return new Response(null, { status, headers: h });
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
