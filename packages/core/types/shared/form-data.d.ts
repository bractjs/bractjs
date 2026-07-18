/**
 * Read a string field from FormData. Returns `""` when the field is missing or
 * is a File (upload) — never `null`/`File`, so it drops straight into code that
 * expects a string. Replaces the `String(formData.get("x") ?? "")` dance.
 */
export declare function formText(formData: FormData, key: string): string;
/**
 * Collect string fields from FormData into a plain object. With no `keys`, every
 * string entry is included (Files are skipped, first occurrence wins per key);
 * with `keys`, only those fields (each defaulting to `""`). Handy for passing a
 * typed subset of a form to a model function.
 */
export declare function formValues(formData: FormData, keys?: string[]): Record<string, string>;
