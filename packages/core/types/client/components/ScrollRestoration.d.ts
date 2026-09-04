import type { RouterLocation } from "../../shared/route-types.ts";
export interface ScrollRestorationProps {
    /**
     * Derive the storage key for a location. Defaults to `location.key` (one
     * position per history entry). Return e.g. `location.pathname` to share one
     * position across every visit to the same path.
     */
    getKey?: (location: RouterLocation) => string;
    /** sessionStorage key holding the persisted positions. */
    storageKey?: string;
}
/**
 * Emulates the browser's scroll restoration on soft navigations. Render it
 * once in `app/root.tsx` (next to `<Scripts />`).
 *
 * Behavior: returning to a history entry (back/forward, reload) restores its
 * saved scroll position; navigating to a new entry scrolls to the top, or to
 * the `#fragment` element when the target has one. Positions are tracked from
 * scroll events (so the leaving page's offset is never lost to layout
 * clamping) and persisted to sessionStorage across reloads.
 */
export declare function ScrollRestoration({ getKey, storageKey }: ScrollRestorationProps): null;
