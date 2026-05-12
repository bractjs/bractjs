import { useContext } from "react";
import { RouterContext } from "../router.tsx";
import { BractJSContext } from "../../shared/context.ts";

/**
 * Returns the current route's action data, typed as T | null.
 * Works in both SSR and client contexts.
 */
export function useActionData<T = unknown>(): T | null {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  const actionData = router?.actionData ?? bract?.actionData ?? null;
  return actionData as T | null;
}
