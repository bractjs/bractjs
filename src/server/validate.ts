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

type Schema<T> = SchemaWithParse<T> | SchemaWithSafeParse<T>;

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
    const out: Record<string, unknown> = {};
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
  const plain = toPlainObject(input);

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
