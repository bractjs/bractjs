// ── createClient ───────────────────────────────────────────────────────────

/**
 * Creates a fully-typed fetch client for BractJS API routes.
 *
 * Usage:
 *   import type { AppApiRoutes } from 'bractjs';
 *   const client = createClient<AppApiRoutes>();
 *   const users = await client['/api/users'].GET();
 *
 * The proxy builds the fetch URL from the property access chain and HTTP method,
 * so `client['/api/users'].GET()` calls `GET /api/users`.
 *
 * This is intentionally minimal (no batching, no retries) — add wrapping as needed.
 */

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// Given a union of route definitions (method/path/input/output), extract
// the output type for a specific method + path pair.
type RouteOutput<
  TRoutes extends { method: string; path: string; input: unknown; output: unknown },
  TMethod extends string,
  TPath extends string,
> = Extract<TRoutes, { method: TMethod; path: TPath }>["output"];

type RouteInput<
  TRoutes extends { method: string; path: string; input: unknown; output: unknown },
  TMethod extends string,
  TPath extends string,
> = Extract<TRoutes, { method: TMethod; path: TPath }>["input"];

type ApiClient<TRoutes extends { method: string; path: string; input: unknown; output: unknown }> = {
  [TPath in TRoutes["path"]]: {
    [TMethod in Extract<TRoutes, { path: TPath }>["method"]]: (
      input?: RouteInput<TRoutes, TMethod, TPath>,
    ) => Promise<UnwrapPromise<RouteOutput<TRoutes, TMethod, TPath>>>;
  };
};

export function createClient<
  TRoutes extends { method: string; path: string; input: unknown; output: unknown },
>(baseUrl = ""): ApiClient<TRoutes> {
  return new Proxy({} as ApiClient<TRoutes>, {
    get(_target, path: string) {
      return new Proxy({} as Record<string, unknown>, {
        get(_t, method: string) {
          return async (input?: unknown) => {
            const httpMethod = method.toUpperCase();
            const url = baseUrl + path;
            const hasBody = httpMethod !== "GET" && httpMethod !== "DELETE" && input !== undefined;
            const res = await fetch(url, {
              method: httpMethod,
              headers: hasBody ? { "Content-Type": "application/json" } : undefined,
              body: hasBody ? JSON.stringify(input) : undefined,
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              throw Object.assign(new Error((err as { error?: string }).error ?? res.statusText), {
                status: res.status,
                response: res,
              });
            }
            return res.json();
          };
        },
      });
    },
  });
}
