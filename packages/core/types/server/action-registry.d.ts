/**
 * Internal: empty the action registry. Used by the dev watcher before a
 * re-scan (so deleted/renamed "use server" modules don't linger) and by tests
 * for isolation. Not part of the public API.
 */
export declare function clearActionRegistry(): void;
export declare function resolveAction(id: string): ((...args: unknown[]) => Promise<unknown>) | null;
export declare function loadServerActions(appDir: string): Promise<void>;
/**
 * Registry-driven counterpart to `loadServerActions`. Skips the filesystem
 * scan and dynamic imports — every entry was already statically imported by
 * `_generated/actions.ts`, so we just iterate and register.
 *
 * Each entry's `relPath` MUST be appDir-relative (matches what
 * `createUseServerProxyPlugin(appDir)` hashed during the client build).
 * Mismatched relPaths produce silent `/_action?id=...` 404s.
 */
export declare function loadServerActionsFromRegistry(entries: Array<{
    relPath: string;
    mod: Record<string, unknown>;
}>): Promise<void>;
