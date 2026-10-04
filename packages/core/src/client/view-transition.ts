import { startTransition } from "react";
import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * Commit a router update, inside a View Transition when `enabled` and the
 * browser supports one (`document.startViewTransition`), else as a regular
 * React transition.
 *
 * The browser snapshots the old page, runs the callback, then snapshots the
 * new one — so the DOM must be updated before the callback returns. A
 * transition (`startTransition`) commits later, which would capture the new
 * snapshot too early; `flushSync` commits synchronously inside the callback.
 */
export function commitWithTransition(enabled: boolean | undefined, update: () => void): void {
  const doc = typeof document === "undefined" ? undefined : (document as ViewTransitionDocument);
  if (enabled && typeof doc?.startViewTransition === "function") {
    doc.startViewTransition(() => {
      flushSync(update);
    });
    return;
  }
  startTransition(update);
}
