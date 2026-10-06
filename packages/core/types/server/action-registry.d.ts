type ActionFn = (...args: unknown[]) => Promise<unknown>;
/** A registered server action and the module it was exported from. */
export interface ActionEntry {
    fn: ActionFn;
    /** appDir-relative path of the defining module (absolute when outside appDir). */
    relPath: string;
    /** The defining module's namespace — its `middleware` export guards its actions. */
    mod: Record<string, unknown>;
}
/** The modules exporting `entry`'s function (at least `entry`'s own). */
export declare function actionExporters(entry: ActionEntry): Array<{
    relPath: string;
    mod: Record<string, unknown>;
}>;
/**
 * Internal: empty the action registry. Used by the dev watcher before a
 * re-scan (so deleted/renamed "use server" modules don't linger) and by tests
 * for isolation. Not part of the public API.
 */
export declare function clearActionRegistry(): void;
export declare function resolveAction(id: string): ActionFn | null;
/** The registered action for `id`, with the module it came from. */
export declare function resolveActionEntry(id: string): ActionEntry | null;
export declare function loadServerActions(appDirInput: string): Promise<void>;
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
export {};
