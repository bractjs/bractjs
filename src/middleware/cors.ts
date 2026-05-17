import type { MiddlewareFn } from "../server/middleware.ts";

export interface CorsOptions {
  origin: string | string[];
  methods?: string[];
  credentials?: boolean;
}

/**
 * Sets CORS headers. Handles OPTIONS preflight with 204.
 *
 * Never reflects the Origin header when "*" is configured — emits literal "*".
 * Refuses to combine credentials:true with "*" (browsers reject it anyway).
 * Always sets `Vary: Origin` so caches don't serve a cross-origin response to
 * the wrong site.
 */
export function cors(options: CorsOptions): MiddlewareFn {
  const allowedOrigins = Array.isArray(options.origin) ? options.origin : [options.origin];
  const allowedMethods = options.methods?.join(", ") ?? "GET, POST, PUT, DELETE, PATCH, OPTIONS";
  const wildcard = allowedOrigins.includes("*");
  const credentials = options.credentials === true;
  if (wildcard && credentials) {
    throw new Error("cors: credentials=true cannot be combined with origin='*'");
  }

  return async (ctx, next) => {
    const origin = ctx.request.headers.get("Origin") ?? "";
    // SECURITY(high): Access-Control-Allow-Headers MUST NOT list
    // `X-BractJS-Action`. That header is the CSRF gate in csrf.ts — its
    // protection relies on browsers blocking non-allowlisted custom headers
    // cross-origin. Adding it here would let any origin forge mutations.
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": allowedMethods,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };
    if (wildcard) {
      corsHeaders["Access-Control-Allow-Origin"] = "*";
    } else if (origin && allowedOrigins.includes(origin)) {
      corsHeaders["Access-Control-Allow-Origin"] = origin;
    }
    if (credentials) corsHeaders["Access-Control-Allow-Credentials"] = "true";

    // Preflight
    if (ctx.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const response = await next();
    // Mutate headers in place rather than wrapping body. Wrapping with
    // `new Response(response.body, response)` makes the original Response
    // unusable to anyone holding a reference (single-shot stream).
    for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);
    return response;
  };
}
