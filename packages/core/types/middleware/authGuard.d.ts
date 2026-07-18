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
export declare function authGuard(options: AuthGuardOptions): MiddlewareFn;
