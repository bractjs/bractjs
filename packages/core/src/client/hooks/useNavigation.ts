import { useContext } from "react";
import { NavigationContext } from "../router.tsx";
import type { NavigationState } from "../router.tsx";

/**
 * Returns the current navigation state.
 * Returns 'idle' during SSR (no NavigationContext present).
 */
export function useNavigation(): { state: NavigationState } {
  const ctx = useContext(NavigationContext);
  return { state: ctx?.state ?? "idle" };
}
