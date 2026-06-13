import { resolveAction } from "./action-registry.ts";
import { json } from "./response.ts";
import { isAllowedMutation, csrfForbiddenResponse } from "./csrf.ts";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// Cap action JSON bodies. Anything over this looks like an abuse attempt;
// FormData uploads (large files) take the multipart branch and bypass this.
const MAX_JSON_BODY_BYTES = 1_048_576; // 1 MiB

// Max nesting we will fully scan for forbidden keys. Legitimate action payloads
// are shallow; anything deeper is treated as hostile.
const MAX_SCAN_DEPTH = 200;

// Deep scan: nested objects can carry __proto__ pollution vectors too.
// SECURITY(high): this is a security filter, so it must FAIL CLOSED. A payload
// nested past MAX_SCAN_DEPTH is rejected (returns true) rather than silently
// passed — otherwise an attacker could bury `__proto__` below the cap to evade
// the check and reach a recursive-merge sink in action code.
function hasForbiddenKey(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object") return false;
  if (depth > MAX_SCAN_DEPTH) return true;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

export async function handleActionRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  // SECURITY(medium): exact-match prevents URL confusion (e.g. "/_actionfoo"
  // would otherwise also reach this handler).
  if (url.pathname !== "/_action") return null;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isAllowedMutation(request)) return csrfForbiddenResponse();

  const id = url.searchParams.get("id");
  if (!id) return new Response("Bad Request: missing action id", { status: 400 });

  const fn = resolveAction(id);
  if (!fn) return new Response("Not Found", { status: 404 });

  let args: unknown[];
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      args = [await request.formData()];
    } else {
      // Cheap pre-check: trust Content-Length if the client sent one.
      const clRaw = request.headers.get("Content-Length");
      if (clRaw) {
        const cl = Number(clRaw);
        if (Number.isFinite(cl) && cl > MAX_JSON_BODY_BYTES) {
          return new Response("Payload Too Large", { status: 413 });
        }
      }
      const text = await request.text();
      // Defense in depth: clients can lie about Content-Length, so verify the
      // actual decoded text length too.
      if (text.length > MAX_JSON_BODY_BYTES) {
        return new Response("Payload Too Large", { status: 413 });
      }
      if (!text) {
        args = [];
      } else {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          return new Response("Bad Request: args must be array", { status: 400 });
        }
        if (parsed.some((v) => hasForbiddenKey(v))) {
          return new Response("Bad Request: forbidden keys", { status: 400 });
        }
        args = parsed;
      }
    }
  } catch {
    return new Response("Bad Request: invalid body", { status: 400 });
  }

  try {
    const result = await fn(...args);
    return json(result ?? null);
  } catch (err) {
    console.error("[bractjs] server action error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
