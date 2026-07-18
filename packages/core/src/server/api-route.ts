import { csrfForbiddenResponse, isAllowedMutation } from "./csrf.ts";
import { isExplicitDev } from "./env.ts";
import { type MiddlewareContext, type MiddlewareFn, runRouteMiddleware } from "./middleware.ts";
import { hasForbiddenKey } from "./proto-guard.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// SECURITY(high): cap request bodies for typed API routes so a single client
// cannot exhaust memory. Same 1 MiB ceiling used by /_action JSON.
const MAX_BODY_BYTES = 1_048_576;

// SECURITY(high): the same state-changing methods the route-action / _action
// paths CSRF-gate. A typed API route using one of these is cross-site
// forgeable (cookies ride along; a form-encoded body is CORS-"simple" and
// skips preflight) unless the caller proves same-origin. We require that proof
// by default — see the gate in handleApiRequest.
const MUTATING_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

export interface ApiRouteOptions {
  /**
   * Cross-site-request-forgery protection for this route. Default `true` for
   * mutating methods (POST/PUT/PATCH/DELETE): the request must be same-origin
   * (proven via `Sec-Fetch-Site`, the `X-BractJS-Action` header, or a matching
   * `Origin`), exactly like server actions. Set `false` ONLY for endpoints
   * that are safe to call cross-site — i.e. they do NOT rely on ambient
   * credentials (session cookies / Basic auth) and are intentionally public
   * (webhooks, token-authenticated APIs, public read/write services).
   * Only GET is exempt from the gate; DELETE is treated as mutating.
   */
  csrf?: boolean;
  /**
   * Per-endpoint middleware, run after the CSRF gate but before body parsing
   * and the handler. Same contract as global/route middleware: call `next()`
   * to continue or return a `Response` to short-circuit (auth gate, rate
   * limit). `ctx.params` holds `:param` segment values from the matched path;
   * values set on `ctx.context` are visible to the handler via its third
   * argument. This is the supported way to guard a typed endpoint — per-route
   * (nested) `middleware` exports do NOT cover `/api`.
   */
  middleware?: MiddlewareFn[];
}

export interface ApiRouteDefinition<TMethod extends HttpMethod, TPath extends string, TInput, TOutput> {
  method: TMethod;
  path: TPath;
  handler: (input: TInput, request: Request, ctx: MiddlewareContext) => TOutput | Promise<TOutput>;
  /** Resolved CSRF setting (defaults applied at registration). */
  csrf: boolean;
  /** Per-endpoint middleware chain (empty when none configured). */
  middleware: MiddlewareFn[];
  _types: { input: TInput; output: TOutput };
}

// Collect all registered routes into a union type.
const routeRegistry: ApiRouteDefinition<HttpMethod, string, any, any>[] = [];

/**
 * Internal: drop every registered API route (routes register via `route()`
 * import side-effects, so tests that import fixtures need a reset). Not part
 * of the public API.
 */
export function clearApiRoutes(): void {
  routeRegistry.length = 0;
}

/**
 * Internal: the currently registered API routes (method + path). Consumed by
 * the dev server's unregistered-endpoint warning. Not part of the public API.
 */
export function listApiRoutes(): Array<{ method: HttpMethod; path: string }> {
  return routeRegistry.map((r) => ({ method: r.method, path: r.path }));
}

/**
 * Define a typed API route.
 *
 * Usage in app/api/users.ts:
 *   export const getUsers = bract.route("GET", "/api/users", async () => db.users.findAll());
 *
 * Mutating routes (POST/PUT/PATCH/DELETE) are CSRF-protected by default — the
 * request must be same-origin. Pass `{ csrf: false }` for a deliberately public,
 * credential-free endpoint (e.g. a webhook):
 *   bract.route("POST", "/api/webhook", handler, { csrf: false });
 */
export function route<TMethod extends HttpMethod, TPath extends string, TInput, TOutput>(
  method: TMethod,
  path: TPath,
  handler: (input: TInput, request: Request, ctx: MiddlewareContext) => TOutput | Promise<TOutput>,
  options?: ApiRouteOptions,
): ApiRouteDefinition<TMethod, TPath, TInput, TOutput> {
  const def: ApiRouteDefinition<TMethod, TPath, TInput, TOutput> = {
    method,
    path,
    handler,
    // Default ON. Opt out only for endpoints that don't trust ambient creds.
    csrf: options?.csrf ?? true,
    middleware: options?.middleware ?? [],
    _types: {} as { input: TInput; output: TOutput },
  };
  // Re-registration (dev cache-busted re-import of the defining module)
  // replaces the previous handler in place — appending would leave the stale
  // handler shadowing the fresh one, since dispatch takes the first match.
  const existing = routeRegistry.findIndex((r) => r.method === def.method && r.path === def.path);
  if (existing >= 0) routeRegistry[existing] = def;
  else routeRegistry.push(def);
  return def;
}

// ── Runtime dispatch ───────────────────────────────────────────────────────

/**
 * Attempt to handle the request by matching against registered API routes.
 * Returns null if no route matches so the caller can fall through.
 */
export async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  for (const def of routeRegistry) {
    if (def.method !== request.method) continue;
    const params = matchPath(def.path, url.pathname);
    if (params === null) continue;

    // SECURITY(high): CSRF gate for mutating methods. Same check the route
    // action / _action / _stream paths use, so an authenticated user's cookies
    // can't be used to forge a cross-site write to an /api route. Routes that
    // opt out (`csrf: false`) are responsible for not trusting ambient creds.
    // Runs BEFORE per-endpoint middleware — middleware cannot weaken it.
    if (def.csrf && MUTATING_METHODS.has(def.method) && !isAllowedMutation(request)) {
      return csrfForbiddenResponse();
    }

    // Shared across the middleware chain and the handler (third argument):
    // middleware sets fields on ctx.context (e.g. the authenticated user) and
    // the handler reads them.
    const ctx: MiddlewareContext = { request, params, context: {} };

    const invoke = async (): Promise<Response> => {
      let input: unknown;
      if (request.method !== "GET" && request.method !== "DELETE") {
      // Trust an advertised Content-Length up front so oversized payloads
      // are rejected before we buffer them.
      const clRaw = request.headers.get("Content-Length");
      if (clRaw) {
        const cl = Number(clRaw);
        if (Number.isFinite(cl) && cl > MAX_BODY_BYTES) {
          return new Response("Payload Too Large", { status: 413 });
        }
      }

      const ct = request.headers.get("Content-Type") ?? "";
      if (ct.includes("application/json")) {
        const text = await request.text();
        // Defense in depth: clients can lie about Content-Length.
        if (text.length > MAX_BODY_BYTES) {
          return new Response("Payload Too Large", { status: 413 });
        }
        try {
          input = text ? JSON.parse(text) : undefined;
        } catch {
          return new Response("Bad Request: invalid JSON", { status: 400 });
        }
        // SECURITY(high): reject prototype-pollution keys before the parsed
        // body reaches a handler that might merge it into another object.
        // Parity with the /_action JSON path.
        if (hasForbiddenKey(input)) {
          return new Response("Bad Request: forbidden keys", { status: 400 });
        }
      } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        input = await request.formData();
      }
      }

      const result = await def.handler(input, request, ctx);
      return Response.json(result);
    };

    try {
      // Middleware runs before body parsing (an auth gate should reject
      // before the server buffers a payload) and can short-circuit by
      // returning a Response instead of calling next().
      return def.middleware.length > 0
        ? await runRouteMiddleware(def.middleware, ctx, invoke)
        : await invoke();
    } catch (err) {
      if (err instanceof Response) return err;
      // SECURITY(high): never leak internal error details in production.
      // Dev mode keeps the message for DX; prod returns a generic 500.
      console.error("[bractjs] api route error:", err);
      const msg = isExplicitDev()
        ? err instanceof Error
          ? err.message
          : String(err)
        : "Internal Server Error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  return null;
}

/**
 * Match a pathname against a route pattern; returns the `:param` values
 * (null-prototype object) or null when it doesn't match.
 */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const pSegs = pattern.split("/").filter(Boolean);
  const rSegs = pathname.split("/").filter(Boolean);
  if (pSegs.length !== rSegs.length) return null;
  const params: Record<string, string> = Object.create(null);
  for (let i = 0; i < pSegs.length; i++) {
    const seg = pSegs[i];
    if (seg.startsWith(":")) {
      // SECURITY(medium): the raw, undecoded segment. Middleware and handlers
      // must validate (especially ".." / path-traversal-shaped values) before
      // using it in file system or SQL operations.
      params[seg.slice(1)] = rSegs[i];
    } else if (seg !== rSegs[i]) {
      return null;
    }
  }
  return params;
}

// ── AppRoutes type extraction ─────────────────────────────────────────────

export type AppApiRoutes =
  (typeof routeRegistry)[number] extends ApiRouteDefinition<infer M, infer P, infer I, infer O>
    ? { method: M; path: P; input: I; output: O }
    : never;
