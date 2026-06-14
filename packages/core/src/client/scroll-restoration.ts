// Pure helpers for <ScrollRestoration /> — kept DOM-free so they are
// unit-testable under bun:test without a browser.

export const SCROLL_STORAGE_KEY = "bractjs:scroll";

/** Cap stored entries so sessionStorage doesn't grow unbounded in long sessions. */
export const MAX_SCROLL_ENTRIES = 50;

/**
 * Record a scroll position for a history-entry key. Re-inserts the key so the
 * map keeps insertion order as LRU order, then evicts the oldest entries past
 * the cap.
 */
export function savePosition(
  positions: Map<string, number>,
  key: string,
  y: number,
  max: number = MAX_SCROLL_ENTRIES,
): void {
  positions.delete(key);
  positions.set(key, y);
  while (positions.size > max) {
    const oldest = positions.keys().next().value;
    if (oldest === undefined) break;
    positions.delete(oldest);
  }
}

export function serializePositions(positions: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries(positions));
}

/** Tolerant parse: malformed/foreign payloads yield an empty map, never throw. */
export function deserializePositions(raw: string | null): Map<string, number> {
  if (!raw) return new Map();
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const positions = new Map<string, number>();
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "number" && Number.isFinite(value)) positions.set(key, value);
      }
    }
    return positions;
  } catch {
    return new Map();
  }
}
