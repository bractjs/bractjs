/** Extra info about a debounced change burst. */
export interface WatchChangeInfo {
    /** The last file event type seen in the burst. */
    event: "rename" | "change";
    /**
     * True when ANY event in the burst was a "rename" (add/remove/rename) — not
     * just the last one. `fs.watch` collapses bursts, so this is OR-accumulated
     * across the debounce window; the codegen trigger keys on it.
     */
    renameSeen: boolean;
}
/** Handle returned by {@link watchApp} so callers can release the watcher. */
export interface AppWatcher {
    /** Stop watching: closes the FSWatcher and cancels any pending debounce. */
    close(): void;
}
/**
 * Watches appDir for file changes and calls onChange with the changed file path.
 * Debounces rapid changes within 50ms to avoid duplicate rebuilds.
 *
 * A rejected/throwing onChange is logged, never left as an unhandled
 * rejection — a broken rebuild must not kill the dev process.
 */
export declare function watchApp(appDir: string, onChange: (file: string, info: WatchChangeInfo) => void | Promise<void>): AppWatcher;
