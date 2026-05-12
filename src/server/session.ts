export type SessionData = Record<string, unknown>;

export interface Session {
  get(key: string): unknown;
  set(key: string, val: unknown): void;
  delete(key: string): void;
  has(key: string): boolean;
}

export interface SessionStorage {
  getSession(cookie?: string | null): Promise<Session>;
  commitSession(session: Session, opts?: CommitOptions): Promise<string>;
}

export interface CookieSessionOptions {
  name: string;
  secrets: string[];
  maxAge?: number;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface CommitOptions {
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
  return JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + pad)) as SessionData;
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
  for (const secret of secrets) {
    const expected = await sign(data, secret);
    if (expected.length === sig.length) {
      let diff = 0;
      for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
      if (diff === 0) return true;
    }
  }
  return false;
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

export function createCookieSession(options: CookieSessionOptions): SessionStorage {
  const { name, secrets, maxAge, secure = true, sameSite = "Lax" } = options;

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
