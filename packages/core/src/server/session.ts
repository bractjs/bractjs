import { hasForbiddenKey } from "./proto-guard.ts";

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

// Internal brand for accessing session data without exposing it on the public interface
const DATA = Symbol("bract.session.data");
interface InternalSession extends Session { [DATA]: SessionData }

// ── Private helpers ─────────────────────────────────────────────────────────

function encode(data: SessionData): string {
  return btoa(JSON.stringify(data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(encoded: string): SessionData {
  const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
  const parsed = JSON.parse(
    atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + pad),
  ) as SessionData;
  // Defense-in-depth: the payload is HMAC-verified before we get here, so this
  // only matters if a signing secret leaks — but a session blob carrying a
  // "__proto__" key must never pollute Object.prototype when read/spread.
  if (hasForbiddenKey(parsed)) {
    throw new Error("session: forbidden key in payload");
  }
  return parsed;
}

async function sign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verify(data: string, sig: string, secrets: string[]): Promise<boolean> {
  // Iterate ALL secrets without short-circuit, and do full-length constant-time
  // compare against every candidate to avoid leaking which secret matched (or
  // whether a length mismatch occurred) via timing.
  let ok = false;
  for (const secret of secrets) {
    const expected = await sign(data, secret);
    const len = Math.max(expected.length, sig.length);
    let diff = expected.length ^ sig.length;
    for (let i = 0; i < len; i++) {
      diff |= (expected.charCodeAt(i) || 0) ^ (sig.charCodeAt(i) || 0);
    }
    if (diff === 0) ok = true;
  }
  return ok;
}

function makeSession(data: SessionData): InternalSession {
  return {
    [DATA]: data,
    get: (key) => data[key],
    set: (key, val) => { data[key] = val; },
    delete: (key) => { delete data[key]; },
    has: (key) => key in data,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

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
// SECURITY(medium): caller can opt out of the Secure flag by passing secure:false; this is safe only on HTTP-only local dev — never use in production without HTTPS.
export function createCookieSession(options: CookieSessionOptions): SessionStorage {
  const { name, secrets, maxAge, secure = true, sameSite = "Lax" } = options;
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error("createCookieSession: secrets must be a non-empty array");
  }
  if (!secrets.every((s) => typeof s === "string" && s.length >= 16)) {
    throw new Error("createCookieSession: each secret must be a string of length >= 16");
  }

  return {
    async getSession(cookie?: string | null): Promise<Session> {
      if (!cookie) return makeSession({});
      const pair = cookie.split(";").map((s) => s.trim()).find((p) => p.startsWith(`${name}=`));
      if (!pair) return makeSession({});

      const value = pair.slice(name.length + 1);
      const dot = value.lastIndexOf(".");
      if (dot === -1) return makeSession({});

      const encoded = value.slice(0, dot);
      const sig = value.slice(dot + 1);
      if (!(await verify(encoded, sig, secrets))) return makeSession({});

      try { return makeSession(decode(encoded)); }
      catch { return makeSession({}); }
    },

    async commitSession(session: Session, opts?: CommitOptions): Promise<string> {
      const data = (session as InternalSession)[DATA] ?? {};
      const encoded = encode(data);
      const sig = await sign(encoded, secrets[0]);
      const age = opts?.maxAge ?? maxAge;

      const parts = [`${name}=${encoded}.${sig}`, "HttpOnly", `SameSite=${sameSite}`, "Path=/"];
      if (age !== undefined) parts.push(`Max-Age=${age}`);
      if (secure) parts.push("Secure");
      return parts.join("; ");
    },
  };
}
