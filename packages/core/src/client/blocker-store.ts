// Registry of React Router-style blockers (`useBlocker(fn)` returning a blocker
// object). ClientRouter consults it before every soft navigation and on
// back/forward; a blocking entry receives the attempted navigation and a
// `proceed` callback to run it later.

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

const blockers = new Set<BlockerEntry>();

export function registerBlocker(entry: BlockerEntry): () => void {
  blockers.add(entry);
  return () => {
    blockers.delete(entry);
  };
}

/**
 * The first registered blocker that wants to stop this navigation, or null.
 * A throwing `shouldBlock` is treated as "don't block" so a buggy guard can't
 * trap the user on a page.
 */
export function findBlocker(args: BlockerFunctionArgs): BlockerEntry | null {
  for (const b of blockers) {
    try {
      if (b.shouldBlock(args)) return b;
    } catch (err) {
      console.error("[bractjs] useBlocker function threw:", err);
    }
  }
  return null;
}
