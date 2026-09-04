/**
 * URLSearchParams → plain object. Repeated keys collapse into arrays
 * (`?tag=a&tag=b` → `{ tag: ["a", "b"] }`), mirroring how `validate()`
 * flattens FormData.
 */
export declare function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]>;
/**
 * Validate a URL's search params against a route's optional `searchSchema`
 * export (Zod/Valibot/standard-schema compatible — same duck typing as
 * `validate()`).
 *
 * - No schema → the raw string record (back-compat: routes that never opted in
 *   see exactly what `request.url` would give them).
 * - Schema failure → throws the 400 `Response` from the validate machinery.
 *   Loaders must never run on unvalidated input; leniency belongs in the
 *   schema itself (`z.coerce.number().catch(1)` is the documented idiom for
 *   URLs that must tolerate junk).
 * - Success → the parsed, coerced object (numbers/booleans/arrays/defaults).
 */
export declare function validateSearch(schema: unknown, url: URL): Promise<Record<string, unknown>>;
