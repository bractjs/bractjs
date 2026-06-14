import type { MiddlewareFn } from "../server/middleware.ts";

/** Minimal session interface — will be unified with createCookieSession in 5.3. */
export interface SessionLike {
  get(key: string): unknown;
}

export interface SessionStorageLike {
  getSession(cookie?: string | null): Promise<SessionLike>;
}

export interface AuthGuardOptions {
  session: SessionStorageLike;
  required?: boolean;
}

/**
 * Reads the Cookie header → gets session → sets ctx.context.user.
 * If required=true and no user, returns 401.
 */
export function authGuard(options: AuthGuardOptions): MiddlewareFn {
  return async (ctx, next) => {
    const cookie = ctx.request.headers.get("Cookie");
    const session = await options.session.getSession(cookie);
    const user = session.get("user");
    ctx.context.user = user ?? null;

    if (options.required && !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return next();
  };
}
