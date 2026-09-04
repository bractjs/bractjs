declare class LoaderCache {
    private store;
    private gcTimer;
    set(key: string, data: Record<string, unknown>, staleTime: number, gcTime: number): void;
    get(key: string): {
        data: Record<string, unknown>;
        fresh: boolean;
    } | null;
    delete(key: string): void;
    /**
     * Drop every entry. Called after a successful mutation — any cached loader
     * data may now be stale, and serving it would show pre-mutation state.
     */
    clear(): void;
    entries(): Array<{
        key: string;
        age: number;
        staleTime: number;
        gcTime: number;
    }>;
    private ensureGc;
}
export declare const loaderCache: LoaderCache;
/**
 * Build a cache key from a route pattern and a (sorted) deps array.
 * Using sorted search ensures `?a=1&b=2` and `?b=2&a=1` hit the same entry.
 */
export declare function cacheKey(pattern: string, deps: unknown[]): string;
export {};
