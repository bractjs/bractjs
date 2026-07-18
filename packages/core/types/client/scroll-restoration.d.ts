export declare const SCROLL_STORAGE_KEY = "bractjs:scroll";
/** Cap stored entries so sessionStorage doesn't grow unbounded in long sessions. */
export declare const MAX_SCROLL_ENTRIES = 50;
/**
 * Record a scroll position for a history-entry key. Re-inserts the key so the
 * map keeps insertion order as LRU order, then evicts the oldest entries past
 * the cap.
 */
export declare function savePosition(positions: Map<string, number>, key: string, y: number, max?: number): void;
export declare function serializePositions(positions: Map<string, number>): string;
/** Tolerant parse: malformed/foreign payloads yield an empty map, never throw. */
export declare function deserializePositions(raw: string | null): Map<string, number>;
