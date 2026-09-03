// Hydration probe for `"use client"` components.
//
// These modules are SSR-stubbed to null, so the server renders nothing for
// them. The first *client* render must also produce null or React reports a
// hydration mismatch (#418) — only afterwards may the real UI appear.
//
// The obvious spelling of that is `useState(false)` + `useEffect(() => setMounted(true), [])`,
// but setting state synchronously in an effect schedules a second render pass
// (and trips react-hooks/set-state-in-effect). `useSyncExternalStore` expresses
// the same thing directly: it is the one hook that can return a *different*
// value on the server than on the client, which is exactly the question being
// asked. React reads `getServerSnapshot` while hydrating and `getSnapshot`
// afterwards, so this flips to `true` on the commit that finishes hydration.
//
// The store never emits, so `subscribe` returns a no-op unsubscribe. All three
// callbacks are module-level constants: passing inline closures would give
// `useSyncExternalStore` a new `subscribe` identity on every render and cause it
// to resubscribe each time.
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/** `false` during SSR and the hydrating render, `true` once mounted on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
