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
/**
 * Deep scan for a forbidden key anywhere in a parsed JSON value.
 *
 * SECURITY(high): this is a security filter, so it FAILS CLOSED. A value nested
 * past MAX_SCAN_DEPTH returns `true` (rejected) rather than being passed
 * through — otherwise an attacker could bury `__proto__` below the cap to evade
 * the check and reach a recursive-merge sink in handler code.
 */
export declare function hasForbiddenKey(value: unknown, depth?: number): boolean;
/**
 * Build a null-prototype object from [key, value] entries. A key named
 * "__proto__" lands as a plain own property instead of mutating the prototype,
 * so downstream spreads/merges of the result are pollution-safe.
 */
export declare function nullProtoFromEntries<V>(entries: Iterable<readonly [string, V]>): Record<string, V>;
