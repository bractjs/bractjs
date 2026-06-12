import { parseTo } from "./nav-utils.ts";

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
export function serializeSearch(search: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        sp.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
      }
    } else {
      sp.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }
  const qs = sp.toString();
  return qs ? "?" + qs : "";
}

/**
 * Replace a path's query string with the serialized `search` object,
 * preserving any hash. No-op when `search` is undefined.
 */
export function withSearch(path: string, search?: Record<string, unknown>): string {
  if (!search) return path;
  const { pathname, hash } = parseTo(path);
  return pathname + serializeSearch(search) + hash;
}
