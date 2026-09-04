import type { ActionData } from "../../shared/route-types.ts";
/**
 * Returns the current route's action data, or null until an action has run.
 * Works in both SSR and client contexts.
 *
 * Prefer passing the action function type — `useActionData<typeof action>()` —
 * so the type is inferred from the action's return. An explicit type still works.
 */
export declare function useActionData<T = unknown>(): ActionData<T> | null;
