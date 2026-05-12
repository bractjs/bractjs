export type SessionData = Record<string, unknown>;

export interface Session {
  get(key: string): unknown;
  set(key: string, val: unknown): void;
  delete(key: string): void;
  has(key: string): boolean;
}

export interface CommitOptions {
  maxAge?: number;
}

export interface SessionStorage {
  getSession(cookie?: string | null): Promise<Session>;
  commitSession(session: Session, opts?: CommitOptions): Promise<string>;
}

export interface CookieSessionOptions {
  /** Cookie name (e.g. "__session"). */
  name: string;
  /** One or more secrets for HMAC signing. Rotation: add new secret first. */
  secrets: string[];
  /** Max age in seconds. Omit for session cookie. */
  maxAge?: number;
  /** Set the Secure flag. Default: true. */
  secure?: boolean;
  /** SameSite policy. Default: "Lax". */
  sameSite?: "Strict" | "Lax" | "None";
}

export declare function createCookieSession(options: CookieSessionOptions): SessionStorage;
