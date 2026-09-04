import type { LifecycleHooks } from "../server/lifecycle.ts";
export interface ServerEntryResult {
    /** True when `<appDir>/server.ts` existed and evaluated without throwing. */
    loaded: boolean;
    /** Set when the file exists but its import threw (its `pipeline.use(...)` registrations may be missing or partial). */
    error?: unknown;
}
/**
 * Import `<appDir>/server.ts` for its side effects (global `pipeline.use(...)`
 * registrations) with its module-scope `createServer()` call suppressed, so
 * `bractjs dev` / `bractjs start` pick up the same middleware the compiled
 * binary gets when it runs the file as its entrypoint.
 *
 * Idempotent per process: a second call hits Bun's module cache, so the file's
 * top-level code (and its pipeline.use calls) run at most once.
 */
export declare function loadServerEntry(appDir: string): Promise<ServerEntryResult>;
/**
 * Load `<appDir>/lifecycle.ts` hooks (default export). Missing file → `{}`.
 * A file that exists but fails to import warns instead of being silently
 * swallowed — a broken lifecycle.ts should not look like "no lifecycle.ts".
 */
export declare function loadLifecycleModule(appDir: string): Promise<LifecycleHooks>;
