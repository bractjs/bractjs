import { isExplicitDev } from "./env.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// SECURITY(high): cap request bodies for typed API routes so a single client
// cannot exhaust memory. Same 1 MiB ceiling used by /_action JSON.
const MAX_BODY_BYTES = 1_048_576;

export interface ApiRouteDefinition<
  TMethod extends HttpMethod,
  TPath extends string,
  TInput,
  TOutput,
> {
  method: TMethod;
  path: TPath;
  handler: (input: TInput, request: Request) => TOutput | Promise<TOutput>;
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
): ApiRouteDefinition<TMethod, TPath, TInput, TOutput> {
  const def: ApiRouteDefinition<TMethod, TPath, TInput, TOutput> = {
    method,
    path,
    handler,
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
