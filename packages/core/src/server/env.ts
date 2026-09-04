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
 * The dev HMR WebSocket port, set by createDevServer and read when rendering
 * the dev bootstrap so the injected HMR client connects to the right port
 * (the config's `hmrPort`, not a hardcoded 3001). 0 = default.
 */
let _devHmrPort = 0;
export function setDevHmrPort(port: number): void {
  _devHmrPort = port;
}
export function getDevHmrPort(): number {
  return _devHmrPort;
}

/**
 * Dev-only module-cache generation. Bumped by the dev watcher whenever a
 * route module's content changes; `devBustedSpecifier` appends it as a query
 * string so the next dynamic import re-evaluates the file instead of serving
 * Bun's cached copy — this is what makes edited loaders/actions live in dev
 * without a process restart. 0 (never bumped) and non-dev runtimes return the
 * path untouched, so `bractjs start` and compiled binaries always import the
 * plain specifier.
 */
let _devModuleGeneration = 0;
export function bumpDevModuleGeneration(): void {
  _devModuleGeneration++;
}
export function devBustedSpecifier(path: string): string {
  if (!isDevRuntime() || _devModuleGeneration === 0) return path;
  return `${path}?v=${_devModuleGeneration}`;
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
  // Cycle detection must track ANCESTORS, not every visited node — a WeakSet
  // of all seen objects flags legitimate shared references as "[Circular]"
  // (e.g. a loader echoing `args.search` while the payload also carries
  // `search` at the top level). MDN's replacer pattern: `this` is the holder
  // object, so popping the stack until the top is the holder leaves exactly
  // the current ancestor chain.
  const ancestors: object[] = [];
  const json = JSON.stringify(data, function (_key, value: unknown) {
    if (typeof value !== "object" || value === null) return value;
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) return "[Circular]";
    ancestors.push(value);
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
