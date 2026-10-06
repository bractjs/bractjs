import { actionMiddlewareChain } from "./action-middleware.ts";
import { type ActionEntry, resolveActionEntry } from "./action-registry.ts";
import { csrfForbiddenResponse, isAllowedMutation } from "./csrf.ts";
import type { ModuleRegistry } from "./layout.ts";
import { createMiddlewareContext, runRouteMiddleware } from "./middleware.ts";
import { hasForbiddenKey } from "./proto-guard.ts";
import { isHttpError, isRedirect } from "../shared/errors.ts";
import { json, redirectEnvelope, sanitizeRedirect } from "./response.ts";

/** Where `/_action` and `/_stream` find the route middleware guarding an action. */
export interface ActionGateOptions {
  appDir: string;
  /** Pre-loaded modules (compiled binary); dev imports from `appDir`. */
  moduleRegistry?: ModuleRegistry;
  /** `false` skips route middleware for actions (`BractJSConfig.actionMiddleware`). */
  routeMiddleware?: boolean;
}

/**
 * Run `work` behind the route middleware for `entry` (see
 * `actionMiddlewareChain`). Without `gate` — direct handler calls in tests —
 * or with `routeMiddleware: false`, `work` runs alone. A redirect from the
 * middleware (returned or thrown) becomes the 204 envelope the client proxy
 * follows; an `HttpError` becomes its status.
 */
export async function runActionGate(
  request: Request,
  entry: ActionEntry,
  gate: ActionGateOptions | undefined,
  work: () => Promise<Response>,
): Promise<Response> {
  if (!gate || gate.routeMiddleware === false) return work();
  const chain = await actionMiddlewareChain(entry, gate.appDir, gate.moduleRegistry);
  if (chain.length === 0) return work();
  try {
    const res = await runRouteMiddleware(chain, createMiddlewareContext(request), work);
    return redirectEnvelope(sanitizeRedirect(res, request.url));
  } catch (err) {
    if (isRedirect(err)) return redirectEnvelope(sanitizeRedirect(err, request.url));
    if (isHttpError(err)) return json({ error: err.message }, { status: err.status });
    throw err;
  }
}

// Cap action JSON bodies. Anything over this looks like an abuse attempt;
// FormData uploads (large files) take the multipart branch and bypass this.
const MAX_JSON_BODY_BYTES = 1_048_576; // 1 MiB

export async function handleActionRequest(
  request: Request,
  gate?: ActionGateOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  // SECURITY(medium): exact-match prevents URL confusion (e.g. "/_actionfoo"
  // would otherwise also reach this handler).
  if (url.pathname !== "/_action") return null;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isAllowedMutation(request)) return csrfForbiddenResponse();

  const id = url.searchParams.get("id");
  if (!id) return new Response("Bad Request: missing action id", { status: 400 });

  const entry = resolveActionEntry(id);
  if (!entry) return new Response("Not Found", { status: 404 });

  // SECURITY(high): the route middleware runs before the body is read, as for
  // typed /api endpoints, so a rejected caller costs no parsing.
  return runActionGate(request, entry, gate, () => invokeAction(request, entry.fn));
}

async function invokeAction(request: Request, fn: ActionEntry["fn"]): Promise<Response> {
  let args: unknown[];
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const parsed = decodeFormArgs(await request.formData());
      if (parsed instanceof Response) return parsed;
      args = parsed;
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
    // `return redirect("/posts")` from an action: the proxy soft-navigates.
    if (isRedirect(result)) return redirectEnvelope(sanitizeRedirect(result, request.url));
    if (result instanceof Response) return result;
    return json(result ?? null);
  } catch (err) {
    // `throw redirect(…)` and `throw new HttpError(…)` are control flow, as in
    // loaders and route actions — not server errors.
    if (isRedirect(err)) return redirectEnvelope(sanitizeRedirect(err, request.url));
    if (isHttpError(err)) return json({ error: err.message }, { status: err.status });
    console.error("[bractjs] server action error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Arguments from a multipart/urlencoded body. The client proxy sends calls
 * with a FormData argument — `action(formData)` from `<form action>`, or
 * `action(prevState, formData)` from React 19's `useActionState` — as one
 * multipart body: `__bract_args` is the JSON argument list with each FormData
 * replaced by `{ "$bractForm": i }`, and that form's entries follow as
 * `i:name` fields (files included). A body without `__bract_args` (a plain
 * form post) is a single FormData argument.
 */
function decodeFormArgs(body: FormData): unknown[] | Response {
  const encoded = body.get("__bract_args");
  if (encoded === null) return [body];
  if (typeof encoded !== "string" || encoded.length > MAX_JSON_BODY_BYTES) {
    return new Response("Bad Request: invalid __bract_args", { status: 400 });
  }
  let list: unknown;
  try {
    list = JSON.parse(encoded);
  } catch {
    return new Response("Bad Request: invalid __bract_args", { status: 400 });
  }
  if (!Array.isArray(list)) return new Response("Bad Request: args must be array", { status: 400 });
  if (list.some((v) => hasForbiddenKey(v))) {
    return new Response("Bad Request: forbidden keys", { status: 400 });
  }
  return list.map((arg, i) => {
    // Only the marker the proxy writes at this exact position becomes a form.
    if (!isFormMarker(arg, i)) return arg;
    const form = new FormData();
    const prefix = `${i}:`;
    for (const [key, value] of body.entries()) {
      if (key.startsWith(prefix)) form.append(key.slice(prefix.length), value);
    }
    return form;
  });
}

function isFormMarker(value: unknown, index: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 && keys[0] === "$bractForm" && (value as { $bractForm: unknown }).$bractForm === index
  );
}
