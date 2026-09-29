import type { RouterLocation } from "../../shared/route-types.ts";
import { type BlockerFunctionArgs } from "../blocker-store.ts";
export type { BlockerFunctionArgs, HistoryAction } from "../blocker-store.ts";
/** React Router's blocker object. */
export type Blocker = {
    state: "unblocked";
    location: undefined;
    proceed: undefined;
    reset: undefined;
} | {
    state: "blocked";
    location: RouterLocation;
    proceed(): void;
    reset(): void;
} | {
    state: "proceeding";
    location: RouterLocation;
    proceed: undefined;
    reset: undefined;
};
export type BlockerFunction = (args: BlockerFunctionArgs) => boolean;
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
export declare function useBlocker(shouldBlock: boolean | BlockerFunction | (() => boolean), options?: {
    confirm?: boolean;
}): Blocker;
