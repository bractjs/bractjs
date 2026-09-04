import type { NavigationState } from "../router.tsx";
/**
 * Returns the current navigation state.
 * Returns 'idle' during SSR (no NavigationContext present).
 */
export declare function useNavigation(): {
    state: NavigationState;
};
