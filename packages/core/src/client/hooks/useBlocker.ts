import { useEffect, useRef } from "react";

/**
 * Intercepts browser back/forward and <Link> clicks when `shouldBlock()` returns true.
 * Shows a native confirm() dialog; the user must confirm to continue navigating.
 *
 * Note: The Link component calls NavigationContext.navigate(), which bypasses this
 * hook's popstate listener.  The hook also patches window.history.pushState so
 * programmatic navigation (including <Link>) is also intercepted.
 */
export function useBlocker(shouldBlock: () => boolean): void {
  // Keep a stable ref so listeners always call the latest version.
  const shouldBlockRef = useRef(shouldBlock);
  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
  });

  // Intercept popstate (browser back/forward).
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (!shouldBlockRef.current()) return;
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
  }, []);

  // Patch history.pushState so <Link> navigations (which call pushState) are
  // intercepted. Restore on cleanup.
  useEffect(() => {
    const original = history.pushState.bind(history);
    history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
      if (shouldBlockRef.current()) {
        if (!window.confirm("Leave page? Changes you made may not be saved.")) return;
      }
      original(state, title, url);
    };
    return () => {
      history.pushState = original;
    };
  }, []);
}
