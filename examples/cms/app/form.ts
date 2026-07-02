// app/form.ts — inline-form helpers for admin route actions.
//
// These now wrap the framework's built-in validation/FormData helpers
// (`safeValidate`, `readValidationError`, `isValidationResponse`, `formValues`)
// so this file is a thin app-specific shim rather than hand-rolled parsing.
// New code can import those directly from "@bractjs/bractjs"; this stays for the
// existing admin routes' `FormState` shape.

import { type FieldErrors, formValues, isValidationResponse, readValidationError } from "@bractjs/bractjs";

export type { FieldErrors };
export type FormState = { error?: string; fieldErrors?: FieldErrors; values?: Record<string, string> };

/** Turn a thrown validate() 400 (or any error) into inline FormState. */
export async function fromValidationError(err: unknown): Promise<FormState> {
  if (isValidationResponse(err)) {
    const { fieldErrors, firstError } = await readValidationError(err);
    return { fieldErrors, error: firstError };
  }
  return { error: err instanceof Error ? err.message : "Something went wrong." };
}

export function firstMessage(errors?: FieldErrors): string | undefined {
  if (!errors) return undefined;
  for (const msgs of Object.values(errors)) if (msgs[0]) return msgs[0];
  return undefined;
}

/** Pull plain string fields out of FormData to repopulate a form after an error. */
export const valuesOf = formValues;
