/**
 * Intercepts browser back/forward and <Link> clicks when `shouldBlock()` returns true.
 * Shows a native confirm() dialog; the user must confirm to continue navigating.
 *
 * Note: The Link component calls NavigationContext.navigate(), which bypasses this
 * hook's popstate listener.  The hook also patches window.history.pushState so
 * programmatic navigation (including <Link>) is also intercepted.
 */
export declare function useBlocker(shouldBlock: () => boolean): void;
