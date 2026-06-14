import { runSchema, type Schema } from "./validate.ts";

// ── Raw extraction ─────────────────────────────────────────────────────────

/**
 * URLSearchParams → plain object. Repeated keys collapse into arrays
 * (`?tag=a&tag=b` → `{ tag: ["a", "b"] }`), mirroring how `validate()`
 * flattens FormData.
 */
export function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  // Null-prototype so a query param named "__proto__" (?__proto__=x) can't
  // pollute Object.prototype when the result is later spread/merged. Using a
  // plain {} here would make `out["__proto__"] = …` a no-op AND, for nested
  // merges downstream, a pollution vector. SECURITY: see proto-guard.ts.
  const out = Object.create(null) as Record<string, string | string[]>;
  for (const [key, value] of sp.entries()) {
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

// ── Validation ─────────────────────────────────────────────────────────────

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
export async function validateSearch(
  schema: unknown,
  url: URL,
): Promise<Record<string, unknown>> {
  const raw = searchParamsToObject(url.searchParams);
  if (!schema) return raw;
  return await runSchema(schema as Schema<Record<string, unknown>>, raw);
}
