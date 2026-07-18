/** The key/value bag stored inside a session cookie. Must be JSON-serializable. */
export type SessionData = Record<string, unknown>;
/** A live session handle returned by {@link SessionStorage.getSession}. */
export interface Session {
    /** Read a value; `undefined` when the key is absent. */
    get(key: string): unknown;
    /** Write a value. Not persisted until {@link SessionStorage.commitSession} is called. */
    set(key: string, val: unknown): void;
    /** Remove a key. */
    delete(key: string): void;
    /** Whether the key exists. */
    has(key: string): boolean;
}
/** Reads sessions from a `Cookie` header and serializes them back to `Set-Cookie`. */
export interface SessionStorage {
    /** Parse the request's `Cookie` header. A missing/invalid/tampered cookie yields an empty session (never throws). */
    getSession(cookie?: string | null): Promise<Session>;
    /** Serialize + HMAC-sign the session into a `Set-Cookie` header value. */
    commitSession(session: Session, opts?: CommitOptions): Promise<string>;
}
/** Options for {@link createCookieSession}. */
export interface CookieSessionOptions {
    /** Cookie name, e.g. `"__session"`. */
    name: string;
    /**
     * HMAC signing secrets, each ≥ 16 chars. `secrets[0]` signs new cookies;
     * the rest still verify — put the newest secret first to rotate.
     */
    secrets: string[];
    /** Default `Max-Age` in seconds. Omit for a browser-session cookie. */
    maxAge?: number;
    /** Set the `Secure` flag (default `true`). Only disable on HTTP-only local dev. */
    secure?: boolean;
    /** `SameSite` attribute (default `"Lax"`). */
    sameSite?: "Strict" | "Lax" | "None";
}
/** Per-commit overrides for {@link SessionStorage.commitSession}. */
export interface CommitOptions {
    /** Override the storage-level `maxAge` for this commit only. */
    maxAge?: number;
}
/**
 * Cookie-based session storage signed with HMAC-SHA256 (`crypto.subtle`).
 *
 * The session data travels base64url-encoded in the cookie value itself
 * (`<payload>.<signature>`); the signature is verified in constant time and
 * supports secret rotation via the `secrets` array. Cookies are always
 * `HttpOnly; Path=/`.
 *
 * @example
 * const storage = createCookieSession({ name: "__session", secrets: [process.env.SESSION_SECRET!] });
 * const session = await storage.getSession(request.headers.get("Cookie"));
 * session.set("userId", user.id);
 * headers.set("Set-Cookie", await storage.commitSession(session));
 */
export declare function createCookieSession(options: CookieSessionOptions): SessionStorage;
