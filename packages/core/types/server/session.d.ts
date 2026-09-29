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
    /** React Router name for {@link Session.delete}. */
    unset(key: string): void;
    /**
     * Set a value that the next `get(key)` returns once and then removes
     * (React Router `session.flash`) — commit the session after reading it.
     */
    flash(key: string, val: unknown): void;
    /** A snapshot of the stored values (flash values included under their internal keys). */
    readonly data: Readonly<SessionData>;
    /** Always `""` — cookie sessions carry their data, not an id (React Router parity). */
    readonly id: string;
}
/** Reads sessions from a `Cookie` header and serializes them back to `Set-Cookie`. */
export interface SessionStorage {
    /** Parse the request's `Cookie` header. A missing/invalid/tampered cookie yields an empty session (never throws). */
    getSession(cookie?: string | null): Promise<Session>;
    /** Serialize + HMAC-sign the session into a `Set-Cookie` header value. */
    commitSession(session: Session, opts?: CommitOptions): Promise<string>;
}
/** What {@link createCookieSession} returns: {@link SessionStorage} plus `destroySession`. */
export interface CookieSessionStorage extends SessionStorage {
    /**
     * A `Set-Cookie` value that deletes the session cookie (React Router
     * `destroySession`). Same as `commitSession` of an empty session with `maxAge: 0`.
     */
    destroySession(session?: Session): Promise<string>;
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
export declare function createCookieSession(options: CookieSessionOptions): CookieSessionStorage;
/** React Router's `createCookieSessionStorage` options (the cookie subset BractJS supports). */
export interface CookieSessionStorageOptions {
    cookie: {
        name?: string;
        secrets?: string[];
        maxAge?: number;
        secure?: boolean;
        sameSite?: "lax" | "strict" | "none" | "Lax" | "Strict" | "None" | boolean;
        /** Accepted for compatibility; BractJS session cookies are always HttpOnly. */
        httpOnly?: boolean;
        /** Accepted for compatibility; BractJS session cookies are always `Path=/`. */
        path?: string;
    };
}
/**
 * React Router's `createCookieSessionStorage({ cookie })`, mapped onto
 * {@link createCookieSession}. `secrets` is required (each ≥ 16 chars) — an
 * unsigned session cookie is refused rather than silently trusted.
 */
export declare function createCookieSessionStorage(options: CookieSessionStorageOptions): CookieSessionStorage;
