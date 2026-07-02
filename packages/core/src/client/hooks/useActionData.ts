import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import type { ActionData } from "../../shared/route-types.ts";
import { RouterContext } from "../router.tsx";

/**
 * Returns the current route's action data, or null until an action has run.
 * Works in both SSR and client contexts.
 *
 * Prefer passing the action function type — `useActionData<typeof action>()` —
 * so the type is inferred from the action's return. An explicit type still works.
 */
export function useActionData<T = unknown>(): ActionData<T> | null {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  const actionData = router?.actionData ?? bract?.actionData ?? null;
  return actionData as ActionData<T> | null;
}
