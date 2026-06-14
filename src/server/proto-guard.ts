/**
 * Prototype-pollution guards, shared across every untrusted-object boundary
 * (server actions, typed /api JSON, form/search → object conversions).
 *
 * Two strategies, used where each fits:
 *
 *  1. {@link hasForbiddenKey} — a deep scan that REJECTS a parsed JSON value
 *     carrying a dangerous key. Used on /_action and /api JSON bodies, where a
 *     400 is the right UX and the payload shape is the app's contract.
 *
 *  2. {@link nullProtoFromEntries} — builds a null-prototype object from
 *     key/value pairs so a key literally named "__proto__" becomes an ordinary
 *     own property that can never reach Object.prototype. Used for the
 *     FormData / URLSearchParams → object conversions, which must accept
 *     arbitrary field names without erroring.
 */

// `__proto__` is the actual pollution vector for own-keys produced by
// JSON.parse. `constructor`/`prototype` are included defensively: a recursive
// merge that walks `obj.constructor.prototype` can be steered by them too.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Max nesting we will fully scan. Legitimate payloads are shallow; anything
// deeper is treated as hostile and rejected (fail closed) — see hasForbiddenKey.
const MAX_SCAN_DEPTH = 200;

/**
 * Deep scan for a forbidden key anywhere in a parsed JSON value.
 *
 * SECURITY(high): this is a security filter, so it FAILS CLOSED. A value nested
 * past MAX_SCAN_DEPTH returns `true` (rejected) rather than being passed
 * through — otherwise an attacker could bury `__proto__` below the cap to evade
 * the check and reach a recursive-merge sink in handler code.
 */
export function hasForbiddenKey(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object") return false;
  if (depth > MAX_SCAN_DEPTH) return true;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

/**
 * Build a null-prototype object from [key, value] entries. A key named
 * "__proto__" lands as a plain own property instead of mutating the prototype,
 * so downstream spreads/merges of the result are pollution-safe.
 */
export function nullProtoFromEntries<V>(
  entries: Iterable<readonly [string, V]>,
): Record<string, V> {
  const out = Object.create(null) as Record<string, V>;
  for (const [k, v] of entries) out[k] = v;
  return out;
}
