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
  /** React Router name for {@link Session.delete}. */
  unset(key: string): void;
  /**
   * Set a value that the next `get(key)` returns once and then removes
   * (React Router `session.flash`) — commit the session after reading it.
   */
  flash(key: string, val: unknown): void;
  /** A snapshot of the stored values (flash values included under their internal keys). */
  readonly data: Readonly<SessionData>;
  /**
   * The session's id in a server-side store ({@link createSessionStorage});
   * `""` for cookie sessions, which carry their data instead (React Router parity).
   */
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
  /** `Domain` attribute, to share the session across subdomains (`"example.com"`). Default: this host only. */
  domain?: string;
}

/** Per-commit overrides for {@link SessionStorage.commitSession}. */
export interface CommitOptions {
  /** Override the storage-level `maxAge` for this commit only. */
  maxAge?: number;
}

// Internal brand for accessing session data without exposing it on the public interface
const DATA = Symbol("bract.session.data");
interface InternalSession extends Session {
  [DATA]: SessionData;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function encode(data: SessionData): string {
  return btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(encoded: string): SessionData {
  const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
  const parsed = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + pad)) as SessionData;
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
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

const flashKey = (key: string) => `__flash_${key}__`;

function makeSession(data: SessionData, id = ""): InternalSession {
  const own = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  return {
    [DATA]: data,
    get: (key) => {
      // A flash value is read once: returning it removes it.
      const fk = flashKey(key);
      if (own(fk)) {
        const v = data[fk];
        delete data[fk];
        return v;
      }
      return own(key) ? data[key] : undefined;
    },
    set: (key, val) => {
      data[key] = val;
    },
    delete: (key) => {
      delete data[key];
    },
    unset: (key) => {
      delete data[key];
    },
    flash: (key, val) => {
      data[flashKey(key)] = val;
    },
    has: (key) => own(key) || own(flashKey(key)),
    get data() {
      return { ...data };
    },
    id,
  };
}

// Browsers drop a cookie over 4096 bytes (name + value + attributes) without
// telling anyone: the user just gets logged out, or the flash never shows.
const MAX_COOKIE_BYTES = 4096;

interface CookieAttrs {
  name: string;
  sameSite: "Strict" | "Lax" | "None";
  secure: boolean;
  domain?: string;
}

function serializeCookie(attrs: CookieAttrs, value: string, maxAge: number | undefined): string {
  const parts = [`${attrs.name}=${value}`, "HttpOnly", `SameSite=${attrs.sameSite}`, "Path=/"];
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (attrs.secure) parts.push("Secure");
  const header = parts.join("; ");
  const bytes = new TextEncoder().encode(header).length;
  if (bytes > MAX_COOKIE_BYTES) {
    throw new Error(
      `[bractjs] The "${attrs.name}" session cookie would be ${bytes} bytes; browsers silently drop cookies ` +
        `over ${MAX_COOKIE_BYTES}. Store less in the session, or keep the data server-side with ` +
        `createSessionStorage() / createMemorySessionStorage(), whose cookie holds only an id.`,
    );
  }
  return header;
}

/** The signed `name=value` pair from a Cookie header, verified; null when absent or forged. */
async function readSignedCookie(cookie: string | null | undefined, name: string, secrets: string[]) {
  if (!cookie) return null;
  const pair = cookie
    .split(";")
    .map((s) => s.trim())
    .find((p) => p.startsWith(`${name}=`));
  if (!pair) return null;
  const value = pair.slice(name.length + 1);
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = value.slice(0, dot);
  if (!(await verify(payload, value.slice(dot + 1), secrets))) return null;
  return payload;
}

function checkSecrets(fn: string, secrets: unknown): asserts secrets is string[] {
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error(`${fn}: secrets must be a non-empty array`);
  }
  if (!secrets.every((s) => typeof s === "string" && s.length >= 16)) {
    throw new Error(`${fn}: each secret must be a string of length >= 16`);
  }
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
export function createCookieSession(options: CookieSessionOptions): CookieSessionStorage {
  const { name, secrets, maxAge, secure = true, sameSite = "Lax", domain } = options;
  checkSecrets("createCookieSession", secrets);
  const attrs: CookieAttrs = { name, sameSite, secure, domain };

  return {
    async getSession(cookie?: string | null): Promise<Session> {
      const encoded = await readSignedCookie(cookie, name, secrets);
      if (encoded === null) return makeSession({});
      try {
        return makeSession(decode(encoded));
      } catch {
        return makeSession({});
      }
    },

    async commitSession(session: Session, opts?: CommitOptions): Promise<string> {
      const data = (session as InternalSession)[DATA] ?? {};
      const encoded = encode(data);
      const sig = await sign(encoded, secrets[0]);
      return serializeCookie(attrs, `${encoded}.${sig}`, opts?.maxAge ?? maxAge);
    },

    async destroySession(): Promise<string> {
      return serializeCookie(attrs, "", 0);
    },
  };
}

/** The data functions behind {@link createSessionStorage} — React Router's `createSessionStorage` strategy. */
export interface SessionDataStrategy {
  /** Store new session data; return its id (unguessable — e.g. `crypto.randomUUID()`). */
  createData(data: SessionData, expires?: Date): Promise<string> | string;
  /** The data for an id, or null when unknown/expired. */
  readData(id: string): Promise<SessionData | null> | SessionData | null;
  /** Replace the data for an id. */
  updateData(id: string, data: SessionData, expires?: Date): Promise<void> | void;
  /** Forget an id. */
  deleteData(id: string): Promise<void> | void;
}

/** Options for {@link createSessionStorage}: the cookie that carries the id, plus the data strategy. */
export interface SessionStorageOptions extends SessionDataStrategy {
  cookie: CookieSessionStorageOptions["cookie"];
}

/**
 * Sessions whose data lives server-side (a database, Redis, memory): the
 * cookie carries only a signed session id, so there's no 4 KB limit, data
 * isn't visible to the client, and sessions can be revoked by deleting them.
 * Same API as cookie sessions — `getSession` / `commitSession` /
 * `destroySession` — and React Router's `createSessionStorage` signature.
 *
 * ```ts
 * const sessions = createSessionStorage({
 *   cookie: { name: "__session", secrets: [process.env.SESSION_SECRET!], maxAge: 60 * 60 * 24 * 7 },
 *   createData: (data, expires) => db.sessions.insert({ data, expires }).id,
 *   readData: (id) => db.sessions.find(id)?.data ?? null,
 *   updateData: (id, data, expires) => db.sessions.update(id, { data, expires }),
 *   deleteData: (id) => db.sessions.delete(id),
 * });
 * ```
 */
export function createSessionStorage(options: SessionStorageOptions): CookieSessionStorage {
  const cookie = cookieAttrsFrom(options.cookie);
  const secrets = options.cookie.secrets ?? [];
  checkSecrets("createSessionStorage", secrets);
  const expiresFor = (maxAge: number | undefined) =>
    maxAge === undefined ? undefined : new Date(Date.now() + maxAge * 1000);

  return {
    async getSession(header?: string | null): Promise<Session> {
      const id = await readSignedCookie(header, cookie.name, secrets);
      if (id === null) return makeSession({});
      const data = await options.readData(id);
      if (!data || hasForbiddenKey(data)) return makeSession({});
      return makeSession({ ...data }, id);
    },

    async commitSession(session: Session, opts?: CommitOptions): Promise<string> {
      const data = (session as InternalSession)[DATA] ?? {};
      const maxAge = opts?.maxAge ?? cookie.maxAge;
      const expires = expiresFor(maxAge);
      let id = session.id;
      if (id) await options.updateData(id, data, expires);
      else id = await options.createData(data, expires);
      return serializeCookie(cookie, `${id}.${await sign(id, secrets[0])}`, maxAge);
    },

    async destroySession(session?: Session): Promise<string> {
      if (session?.id) await options.deleteData(session.id);
      return serializeCookie(cookie, "", 0);
    },
  };
}

/**
 * {@link createSessionStorage} backed by an in-process `Map` — for
 * development, tests and single-server apps. Sessions vanish on restart and
 * aren't shared between processes; expired ones are dropped as they're read.
 */
export function createMemorySessionStorage(options: {
  cookie: CookieSessionStorageOptions["cookie"];
}): CookieSessionStorage {
  const store = new Map<string, { data: SessionData; expires?: Date }>();
  return createSessionStorage({
    cookie: options.cookie,
    createData(data, expires) {
      const id = crypto.randomUUID();
      store.set(id, { data: structuredClone(data), expires });
      return id;
    },
    readData(id) {
      const entry = store.get(id);
      if (!entry) return null;
      if (entry.expires && entry.expires.getTime() <= Date.now()) {
        store.delete(id);
        return null;
      }
      return structuredClone(entry.data);
    },
    updateData(id, data, expires) {
      store.set(id, { data: structuredClone(data), expires });
    },
    deleteData(id) {
      store.delete(id);
    },
  });
}

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
    /** `Domain` attribute (share the session across subdomains). */
    domain?: string;
  };
}

function cookieAttrsFrom(c: CookieSessionStorageOptions["cookie"]): CookieAttrs & { maxAge?: number } {
  const s = c.sameSite;
  const sameSite =
    s === undefined || s === false
      ? "Lax"
      : s === true
        ? "Strict"
        : ((s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) as "Lax" | "Strict" | "None");
  return {
    name: c.name ?? "__session",
    sameSite,
    secure: c.secure ?? true,
    domain: c.domain,
    maxAge: c.maxAge,
  };
}

/**
 * React Router's `createCookieSessionStorage({ cookie })`, mapped onto
 * {@link createCookieSession}. `secrets` is required (each ≥ 16 chars) — an
 * unsigned session cookie is refused rather than silently trusted.
 */
export function createCookieSessionStorage(options: CookieSessionStorageOptions): CookieSessionStorage {
  const c = options.cookie ?? {};
  const attrs = cookieAttrsFrom(c);
  return createCookieSession({
    name: attrs.name,
    secrets: c.secrets ?? [],
    maxAge: attrs.maxAge,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    domain: attrs.domain,
  });
}
