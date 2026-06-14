// ── Duck-typed schema interface ────────────────────────────────────────────

interface SchemaWithParse<T> {
  parse(input: unknown): T;
}

interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: { issues?: Array<{ path: (string | number)[]; message: string }> };
}

interface SchemaWithSafeParse<T> {
  safeParse(input: unknown): SafeParseResult<T> | Promise<SafeParseResult<T>>;
}

export type Schema<T> = SchemaWithParse<T> | SchemaWithSafeParse<T>;

// ── Field error shape ─────────────────────────────────────────────────────

export interface FieldErrors {
  [field: string]: string[];
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(public readonly fieldErrors: FieldErrors) {
    super("Validation failed");
  }
}

// ── validate() ────────────────────────────────────────────────────────────

function toPlainObject(input: FormData | Record<string, unknown>): Record<string, unknown> {
  if (input instanceof FormData) {
    // Null-prototype: a form field literally named "__proto__" becomes a plain
    // own key here instead of mutating Object.prototype when the result is
    // later spread/merged. SECURITY: see src/server/proto-guard.ts.
    const out = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of input.entries()) {
      if (key in out) {
        const existing = out[key];
        out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  return input;
}

/**
 * Run a plain object through a Zod/Valibot-compatible schema. The shared core
 * of `validate()` (action/form bodies) and `validateSearch()` (URL search
 * params). Throws a 400 `Response` with `{ errors }` field errors on failure;
 * returns the parsed (coerced) data on success.
 */
export async function runSchema<T>(
  schema: Schema<T>,
  plain: Record<string, unknown>,
): Promise<T> {
  if ("safeParse" in schema && typeof schema.safeParse === "function") {
    const result = await schema.safeParse(plain);
    if ((result as SafeParseResult<T>).success) {
      return (result as SafeParseResult<T>).data as T;
    }
    const issues = (result as SafeParseResult<T>).error?.issues ?? [];
    const fieldErrors: FieldErrors = {};
    for (const issue of issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const err = new ValidationError(fieldErrors);
    throw Response.json({ errors: fieldErrors }, { status: 400, statusText: err.message });
  }

  // Fallback: plain .parse() — wrap any thrown error.
  try {
    return (schema as SchemaWithParse<T>).parse(plain);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fieldErrors: FieldErrors = { _: [message] };
    throw Response.json({ errors: fieldErrors }, { status: 400, statusText: "Validation failed" });
  }
}

/**
 * Validate `input` against a Zod-compatible or Valibot-compatible schema.
 *
 * - If the schema has `.safeParse()`: uses it to collect field errors and throws
 *   a typed `ValidationError` on failure (which the framework converts to a 400).
 * - If the schema only has `.parse()`: wraps it and re-throws the error as a
 *   `ValidationError` with a single `_` field containing the error message.
 *
 * Returns the parsed (coerced) data on success.
 */
export async function validate<T>(
  schema: Schema<T>,
  input: FormData | Record<string, unknown>,
): Promise<T> {
  return runSchema(schema, toPlainObject(input));
}

// ── Non-throwing validation (ergonomic action idiom) ───────────────────────

export type SafeValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors; firstError: string };

/**
 * Like {@link validate}, but returns a result instead of throwing — the
 * ergonomic shape for actions that want to render field errors:
 *
 * ```ts
 * const r = await safeValidate(PostSchema, formData);
 * if (!r.ok) return { error: r.firstError, fieldErrors: r.fieldErrors };
 * usePost(r.data);
 * ```
 *
 * `firstError` is the first message across all fields, or a generic fallback.
 */
export async function safeValidate<T>(
  schema: Schema<T>,
  input: FormData | Record<string, unknown>,
): Promise<SafeValidateResult<T>> {
  try {
    const data = await runSchema(schema, toPlainObject(input));
    return { ok: true, data };
  } catch (err) {
    if (isValidationResponse(err)) {
      const { fieldErrors, firstError } = await readValidationError(err);
      return { ok: false, fieldErrors, firstError };
    }
    throw err; // not a validation failure — let it propagate
  }
}

/**
 * True for the 400 `Response` thrown by {@link validate} / `searchSchema`
 * validation (identified by status 400 + `statusText "Validation failed"`).
 * Use it in the try/catch idiom when you keep calling `validate()` directly.
 */
export function isValidationResponse(value: unknown): value is Response {
  return value instanceof Response && value.status === 400 && value.statusText === "Validation failed";
}

/**
 * Parse the `{ errors }` body of a validation 400 `Response` into field errors
 * plus the first message. Tolerant of a non-JSON / unexpected body.
 */
export async function readValidationError(
  res: Response,
): Promise<{ fieldErrors: FieldErrors; firstError: string }> {
  const fallback = "Please check your input.";
  try {
    const body = (await res.clone().json()) as { errors?: FieldErrors };
    const fieldErrors = body.errors ?? {};
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? fallback;
    return { fieldErrors, firstError };
  } catch {
    return { fieldErrors: {}, firstError: fallback };
  }
}
