// Small ergonomics for reading FormData in actions, where `.get()` returns
// `string | File | null` and almost every call site coerces to a string.

/**
 * Read a string field from FormData. Returns `""` when the field is missing or
 * is a File (upload) — never `null`/`File`, so it drops straight into code that
 * expects a string. Replaces the `String(formData.get("x") ?? "")` dance.
 */
export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Collect string fields from FormData into a plain object. With no `keys`, every
 * string entry is included (Files are skipped, first occurrence wins per key);
 * with `keys`, only those fields (each defaulting to `""`). Handy for passing a
 * typed subset of a form to a model function.
 */
export function formValues(
  formData: FormData,
  keys?: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (keys) {
    for (const key of keys) out[key] = formText(formData, key);
    return out;
  }
  for (const [key, value] of formData.entries()) {
    if (key in out) continue; // first occurrence wins (mirrors FormData.get)
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
