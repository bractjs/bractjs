import type { MiddlewareFn } from "../server/middleware.ts";

export interface CorsOptions {
  origin: string | string[];
  methods?: string[];
}

/**
 * Sets CORS headers. Handles OPTIONS preflight with 204.
 */
export function cors(options: CorsOptions): MiddlewareFn {
  const allowedOrigins = Array.isArray(options.origin)
    ? options.origin
    : [options.origin];
  const allowedMethods = options.methods?.join(", ") ?? "GET, POST, PUT, DELETE, PATCH, OPTIONS";

  return async (ctx, next) => {
    const origin = ctx.request.headers.get("Origin") ?? "";
    const allowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": allowedMethods,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (allowed) corsHeaders["Access-Control-Allow-Origin"] = origin || "*";

    // Preflight
    if (ctx.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const response = await next();
    const patched = new Response(response.body, response);
    for (const [k, v] of Object.entries(corsHeaders)) patched.headers.set(k, v);
    return patched;
  };
}
