import { useCallback, useEffect, useRef, useState } from "react";
import type { RouterLocation } from "../../shared/route-types.ts";
import { type BlockerFunctionArgs, registerBlocker } from "../blocker-store.ts";

export type { BlockerFunctionArgs, HistoryAction } from "../blocker-store.ts";

/** React Router's blocker object. */
export type Blocker =
  | { state: "unblocked"; location: undefined; proceed: undefined; reset: undefined }
  | { state: "blocked"; location: RouterLocation; proceed(): void; reset(): void }
  | { state: "proceeding"; location: RouterLocation; proceed: undefined; reset: undefined };

export type BlockerFunction = (args: BlockerFunctionArgs) => boolean;

const UNBLOCKED: Blocker = { state: "unblocked", location: undefined, proceed: undefined, reset: undefined };

/**
 * Block in-app navigation. Two modes:
 *
 * **React Router mode** — pass a boolean, a function that takes the
 * `{ currentLocation, nextLocation, historyAction }` argument, or
 * `{ confirm: false }`. Returns a blocker: when a soft navigation (`<Link>`,
 * `navigate()`, back/forward) is stopped, `blocker.state` becomes `"blocked"`
 * and you render your own prompt, calling `blocker.proceed()` or
 * `blocker.reset()`.
 *
 * ```tsx
 * const blocker = useBlocker(({ currentLocation, nextLocation }) =>
 *   dirty && currentLocation.pathname !== nextLocation.pathname);
 * {blocker.state === "blocked" && <Dialog onYes={blocker.proceed} onNo={blocker.reset} />}
 * ```
 *
 * **BractJS legacy mode** — a zero-argument function (`useBlocker(() => dirty)`)
 * keeps the original behavior: the browser's `confirm()` prompt, also covering
 * programmatic `history.pushState`. The returned blocker stays `"unblocked"`.
 *
 * Neither mode covers full page loads (closing the tab, typing a URL) — use a
 * `beforeunload` listener for those.
 */
export function useBlocker(
  shouldBlock: boolean | BlockerFunction | (() => boolean),
  options?: { confirm?: boolean },
): Blocker {
  const legacy = typeof shouldBlock === "function" && shouldBlock.length === 0 && options?.confirm !== false;
  const shouldBlockRef = useRef(shouldBlock);
  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
  });

  // ── React Router mode ────────────────────────────────────────────────────
  const [blocker, setBlocker] = useState<Blocker>(UNBLOCKED);
  // Mirrors `blocker` for the router's synchronous checks. Written in the same
  // (event-time) call as setBlocker, so a second navigation attempted before
  // React re-renders already sees "blocked".
  const blockerRef = useRef(blocker);
  const commit = useCallback((next: Blocker) => {
    blockerRef.current = next;
    setBlocker(next);
  }, []);

  const reset = useCallback(() => commit(UNBLOCKED), [commit]);

  useEffect(() => {
    if (legacy) return;
    return registerBlocker({
      shouldBlock(args) {
        // One pending prompt at a time; a navigation attempted while already
        // blocked is simply dropped.
        if (blockerRef.current.state !== "unblocked") return blockerRef.current.state === "blocked";
        const s = shouldBlockRef.current;
        return typeof s === "function" ? (s as BlockerFunction)(args) : s;
      },
      onBlock(location, proceed) {
        if (blockerRef.current.state !== "unblocked") return;
        commit({
          state: "blocked",
          location,
          reset,
          proceed() {
            commit({ state: "proceeding", location, proceed: undefined, reset: undefined });
            void proceed().finally(() => commit(UNBLOCKED));
          },
        });
      },
    });
  }, [legacy, reset, commit]);

  // ── Legacy confirm() mode ────────────────────────────────────────────────
  // Intercept popstate (browser back/forward).
  useEffect(() => {
    if (!legacy) return;
    const check = () => (shouldBlockRef.current as () => boolean)();
    function onPopState(e: PopStateEvent) {
      if (!check()) return;
      // The browser already moved back — push the user back to the current
      // page before asking, then confirm.
      e.preventDefault();
      if (!window.confirm("Leave page? Changes you made may not be saved.")) {
        // Re-push the current URL so the address bar doesn't change.
        history.pushState(null, "", window.location.href);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [legacy]);

  // Patch history.pushState so <Link> navigations (which call pushState) are
  // intercepted. Restore on cleanup.
  useEffect(() => {
    if (!legacy) return;
    const original = history.pushState.bind(history);
    history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
      if ((shouldBlockRef.current as () => boolean)()) {
        if (!window.confirm("Leave page? Changes you made may not be saved.")) return;
      }
      original(state, title, url);
    };
    return () => {
      history.pushState = original;
    };
  }, [legacy]);

  return legacy ? UNBLOCKED : blocker;
}
