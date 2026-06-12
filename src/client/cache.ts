// ── LoaderCache ────────────────────────────────────────────────────────────

interface CacheEntry {
  data: Record<string, unknown>;
  timestamp: number;
  staleTime: number;
  gcTime: number;
}

class LoaderCache {
  private store = new Map<string, CacheEntry>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  set(key: string, data: Record<string, unknown>, staleTime: number, gcTime: number): void {
    this.store.set(key, { data, timestamp: Date.now(), staleTime, gcTime });
    this.ensureGc();
  }

  get(key: string): { data: Record<string, unknown>; fresh: boolean } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.timestamp;
    if (age > entry.gcTime) {
      this.store.delete(key);
      return null;
    }
    return { data: entry.data, fresh: age < entry.staleTime };
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Drop every entry. Called after a successful mutation — any cached loader
   * data may now be stale, and serving it would show pre-mutation state.
   */
  clear(): void {
    this.store.clear();
  }

  entries(): Array<{ key: string; age: number; staleTime: number; gcTime: number }> {
    const now = Date.now();
    return Array.from(this.store.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      staleTime: entry.staleTime,
      gcTime: entry.gcTime,
    }));
  }

  private ensureGc(): void {
    if (this.gcTimer !== null) return;
    this.gcTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now - entry.timestamp > entry.gcTime) this.store.delete(key);
      }
      if (this.store.size === 0) {
        clearInterval(this.gcTimer!);
        this.gcTimer = null;
      }
    }, 60_000);
  }
}

export const loaderCache = new LoaderCache();

// ── Cache key helpers ──────────────────────────────────────────────────────

/**
 * Build a cache key from a route pattern and a (sorted) deps array.
 * Using sorted search ensures `?a=1&b=2` and `?b=2&a=1` hit the same entry.
 */
export function cacheKey(pattern: string, deps: unknown[]): string {
  return pattern + "\0" + JSON.stringify(deps);
}
