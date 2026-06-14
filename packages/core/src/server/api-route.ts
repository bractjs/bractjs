import { isExplicitDev } from "./env.ts";
import { isAllowedMutation, csrfForbiddenResponse } from "./csrf.ts";
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
}

export interface ApiRouteDefinition<
  TMethod extends HttpMethod,
  TPath extends string,
  TInput,
  TOutput,
> {
  method: TMethod;
  path: TPath;
  handler: (input: TInput, request: Request) => TOutput | Promise<TOutput>;
  /** Resolved CSRF setting (defaults applied at registration). */
  csrf: boolean;
  _types: { input: TInput; output: TOutput };
}

// Collect all registered routes into a union type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routeRegistry: ApiRouteDefinition<HttpMethod, string, any, any>[] = [];

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
export function route<
  TMethod extends HttpMethod,
  TPath extends string,
  TInput,
  TOutput,
>(
  method: TMethod,
  path: TPath,
  handler: (input: TInput, request: Request) => TOutput | Promise<TOutput>,
  options?: ApiRouteOptions,
): ApiRouteDefinition<TMethod, TPath, TInput, TOutput> {
  const def: ApiRouteDefinition<TMethod, TPath, TInput, TOutput> = {
    method,
    path,
    handler,
    // Default ON. Opt out only for endpoints that don't trust ambient creds.
    csrf: options?.csrf ?? true,
    _types: {} as { input: TInput; output: TOutput },
  };
  routeRegistry.push(def);
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
    if (!pathMatches(def.path, url.pathname)) continue;

    // SECURITY(high): CSRF gate for mutating methods. Same check the route
    // action / _action / _stream paths use, so an authenticated user's cookies
    // can't be used to forge a cross-site write to an /api route. Routes that
    // opt out (`csrf: false`) are responsible for not trusting ambient creds.
    if (def.csrf && MUTATING_METHODS.has(def.method) && !isAllowedMutation(request)) {
      return csrfForbiddenResponse();
    }

    let input: unknown = undefined;
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

    try {
      const result = await def.handler(input, request);
      return Response.json(result);
    } catch (err) {
      if (err instanceof Response) return err;
      // SECURITY(high): never leak internal error details in production.
      // Dev mode keeps the message for DX; prod returns a generic 500.
      console.error("[bractjs] api route error:", err);
      const msg = isExplicitDev()
        ? (err instanceof Error ? err.message : String(err))
        : "Internal Server Error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  return null;
}

function pathMatches(pattern: string, pathname: string): boolean {
  const pSegs = pattern.split("/").filter(Boolean);
  const rSegs = pathname.split("/").filter(Boolean);
  if (pSegs.length !== rSegs.length) return false;
  // SECURITY(medium): `:param` segments accept any non-empty string but are
  // not currently passed to the handler — handlers must read params from
  // `request.url` themselves and validate (especially against ".." or
  // path-traversal-shaped values) before using them in file system or SQL ops.
  return pSegs.every((seg, i) => seg.startsWith(":") || seg === rSegs[i]);
}

// ── AppRoutes type extraction ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppApiRoutes = (typeof routeRegistry)[number] extends ApiRouteDefinition<infer M, infer P, infer I, infer O>
  ? { method: M; path: P; input: I; output: O }
  : never;
