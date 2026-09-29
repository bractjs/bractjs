import type { RouterLocation } from "../shared/route-types.ts";
export type HistoryAction = "POP" | "PUSH" | "REPLACE";
export interface BlockerFunctionArgs {
    currentLocation: RouterLocation;
    nextLocation: RouterLocation;
    historyAction: HistoryAction;
}
export interface BlockerEntry {
    shouldBlock(args: BlockerFunctionArgs): boolean;
    /** Called when this blocker stops a navigation. */
    onBlock(nextLocation: RouterLocation, proceed: () => Promise<void>): void;
}
export declare function registerBlocker(entry: BlockerEntry): () => void;
/**
 * The first registered blocker that wants to stop this navigation, or null.
 * A throwing `shouldBlock` is treated as "don't block" so a buggy guard can't
 * trap the user on a page.
 */
export declare function findBlocker(args: BlockerFunctionArgs): BlockerEntry | null;
