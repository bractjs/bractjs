interface SchemaWithParse<T> {
    parse(input: unknown): T;
}
interface SafeParseResult<T> {
    success: boolean;
    data?: T;
    error?: {
        issues?: Array<{
            path: (string | number)[];
            message: string;
        }>;
    };
}
interface SchemaWithSafeParse<T> {
    safeParse(input: unknown): SafeParseResult<T> | Promise<SafeParseResult<T>>;
}
export type Schema<T> = SchemaWithParse<T> | SchemaWithSafeParse<T>;
export interface FieldErrors {
    [field: string]: string[];
}
export declare class ValidationError extends Error {
    readonly fieldErrors: FieldErrors;
    readonly status = 400;
    constructor(fieldErrors: FieldErrors);
}
/**
 * Run a plain object through a Zod/Valibot-compatible schema. The shared core
 * of `validate()` (action/form bodies) and `validateSearch()` (URL search
 * params). Throws a 400 `Response` with `{ errors }` field errors on failure;
 * returns the parsed (coerced) data on success.
 */
export declare function runSchema<T>(schema: Schema<T>, plain: Record<string, unknown>): Promise<T>;
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
export declare function validate<T>(schema: Schema<T>, input: FormData | Record<string, unknown>): Promise<T>;
export type SafeValidateResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    fieldErrors: FieldErrors;
    firstError: string;
};
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
export declare function safeValidate<T>(schema: Schema<T>, input: FormData | Record<string, unknown>): Promise<SafeValidateResult<T>>;
/**
 * True for the 400 `Response` thrown by {@link validate} / `searchSchema`
 * validation (identified by status 400 + `statusText "Validation failed"`).
 * Use it in the try/catch idiom when you keep calling `validate()` directly.
 */
export declare function isValidationResponse(value: unknown): value is Response;
/**
 * Parse the `{ errors }` body of a validation 400 `Response` into field errors
 * plus the first message. Tolerant of a non-JSON / unexpected body.
 */
export declare function readValidationError(res: Response): Promise<{
    fieldErrors: FieldErrors;
    firstError: string;
}>;
export {};
