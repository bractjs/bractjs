export function isDev(): boolean {
  return Bun.env.NODE_ENV !== "production";
}

/**
 * Runtime mode — what the server is actually doing, independent of NODE_ENV.
 * `bractjs dev` sets this to "dev". `bractjs start` leaves it at "prod".
 *
 * Use this (not isDev()) to gate dev-only behavior like HMR injection or
 * re-reading the route manifest on every request. NODE_ENV alone is unreliable:
 * a user running `NODE_ENV=development bractjs start` would otherwise get a
 * production server that still ships an HMR client trying to reconnect to a
 * non-existent ws://localhost:3001 forever.
 */
let _runtimeMode: "dev" | "prod" = "prod";
export function setRuntimeMode(m: "dev" | "prod"): void {
  _runtimeMode = m;
}
export function isDevRuntime(): boolean {
  return _runtimeMode === "dev";
}

/**
 * Strict "is development?" check used to gate sensitive output (error
 * messages, stack traces) that would otherwise leak in production.
 *
 * Unlike isDev(), this returns true ONLY when NODE_ENV is explicitly set
 * to "development". An unset/empty NODE_ENV is treated as production so an
 * operator who forgets to set it never leaks internals.
 *
 * SECURITY(high): always use this for guarding info-disclosure code paths
 * (server errors → response bodies) rather than isDev().
 */
export function isExplicitDev(): boolean {
  const v = Bun.env.NODE_ENV;
  return v === "development" || v === "dev";
}

export function requireEnv(key: string): string {
  const value = Bun.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Build LS/PS at runtime so the source contains no raw U+2028/U+2029
// (which would break JS parsing as LineTerminators).
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

export function safeStringify(data: unknown): string {
  const seen = new WeakSet();
  const json = JSON.stringify(data, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
  // Escape HTML-sensitive chars + JS LineTerminators (U+2028 / U+2029) so this
  // JSON is safe to embed inside a <script> tag.
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(LS, "\\u2028")
    .replaceAll(PS, "\\u2029");
}
