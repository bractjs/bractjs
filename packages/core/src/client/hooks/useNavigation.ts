import { useContext } from "react";
import type { RouterLocation } from "../../shared/route-types.ts";
import type { NavigationState } from "../router.tsx";
import { NavigationContext } from "../router.tsx";

/**
 * The pending navigation (React Router `Navigation` shape). Every field but
 * `state` is `undefined` while idle.
 */
export interface Navigation {
  state: NavigationState;
  /** Where the pending navigation is going (loading, and the post-action reload). */
  location?: RouterLocation;
  /** Uppercase method of the pending `<Form>` / `useSubmit()` submission. */
  formMethod?: string;
  /** URL the pending submission posts to. */
  formAction?: string;
  formEncType?: string;
  /** Submitted fields — render optimistic UI from these while `state === "submitting"`. */
  formData?: FormData;
  /** The payload of an `encType: "application/json"` submission. */
  json?: unknown;
  /** The payload of an `encType: "text/plain"` submission. */
  text?: string;
}

/**
 * Returns the current navigation: `state` ("idle" | "loading" | "submitting")
 * plus, while one is pending, its target `location` and submission fields.
 * Returns `{ state: "idle" }` during SSR (no NavigationContext present).
 */
export function useNavigation(): Navigation {
  const ctx = useContext(NavigationContext);
  if (!ctx) return { state: "idle" };
  const d = ctx.detail;
  if (ctx.state === "idle" || !d) return { state: ctx.state };
  return {
    state: ctx.state,
    location: d.location,
    formMethod: d.formMethod,
    formAction: d.formAction,
    formEncType: d.formEncType,
    formData: d.formData,
    json: d.json,
    text: d.text,
  };
}
