import { resolveAction } from "./action-registry.ts";
import { json } from "./response.ts";
import { isAllowedMutation } from "./csrf.ts";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// Cap action JSON bodies. Anything over this looks like an abuse attempt;
// FormData uploads (large files) take the multipart branch and bypass this.
const MAX_JSON_BODY_BYTES = 1_048_576; // 1 MiB

function hasForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
  }
  return false;
}

export async function handleActionRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/_action")) return null;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isAllowedMutation(request)) return new Response("Forbidden", { status: 403 });

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
        if (parsed.some(hasForbiddenKey)) {
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
