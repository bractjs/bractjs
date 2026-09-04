/**
 * Serialize a validated-search-shaped object back into a query string
 * (including the leading `?`, or `""` when empty).
 *
 * - `undefined`/`null` values are dropped (the way to delete a param).
 * - Arrays serialize as repeated keys (`{ tag: ["a","b"] }` → `?tag=a&tag=b`),
 *   the inverse of the server's `searchParamsToObject`.
 * - Other objects are JSON-stringified; pair them with a schema field that
 *   `JSON.parse`s on the way in.
 * - Everything else goes through `String()` — the server schema re-coerces on
 *   the next request, so numbers/booleans round-trip.
 */
export declare function serializeSearch(search: Record<string, unknown>): string;
/**
 * Replace a path's query string with the serialized `search` object,
 * preserving any hash. No-op when `search` is undefined.
 */
export declare function withSearch(path: string, search?: Record<string, unknown>): string;
