import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "../hooks/useLocation.ts";
import type { RouterLocation } from "../../shared/route-types.ts";
import {
  SCROLL_STORAGE_KEY,
  savePosition,
  serializePositions,
  deserializePositions,
} from "../scroll-restoration.ts";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────

// useLayoutEffect warns during SSR; the component renders nothing and the
// effect only matters in the browser, so alias it away on the server.
const useBrowserLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

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
export function ScrollRestoration({ getKey, storageKey = SCROLL_STORAGE_KEY }: ScrollRestorationProps): null {
  const location = useLocation();

  const getKeyRef = useRef(getKey);
  useEffect(() => { getKeyRef.current = getKey; });

  // Lazily hydrated from sessionStorage on first access — the restore layout
  // effect runs before mount effects, so eager hydration would come too late.
  const positionsRef = useRef<Map<string, number> | null>(null);
  const getPositions = (): Map<string, number> => {
    if (positionsRef.current === null) {
      positionsRef.current = deserializePositions(sessionStorage.getItem(storageKey));
    }
    return positionsRef.current;
  };

  /** Storage key of the entry currently on screen (what scroll events record). */
  const activeKeyRef = useRef<string | null>(null);

  // Take manual control + persist across reloads/full navigations.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const persist = () => {
      if (positionsRef.current !== null) {
        try {
          sessionStorage.setItem(storageKey, serializePositions(positionsRef.current));
        } catch {
          // Storage full/blocked — restoration degrades to in-memory only.
        }
      }
    };
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [storageKey]);

  // Continuously record the active entry's position (rAF-throttled). Recording
  // from scroll events — rather than snapshotting at navigation time — means
  // the position is already saved before the new page's (possibly shorter)
  // content clamps window.scrollY.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (activeKeyRef.current !== null) {
          savePosition(getPositions(), activeKeyRef.current, window.scrollY);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply scroll on every committed location change (and on first mount, which
  // restores the position after a reload).
  useBrowserLayoutEffect(() => {
    const key = getKeyRef.current ? getKeyRef.current(location) : location.key;
    if (activeKeyRef.current === key) return;
    activeKeyRef.current = key;

    const saved = getPositions().get(key);
    if (typeof saved === "number") {
      window.scrollTo(0, saved);
      return;
    }
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return null;
}
