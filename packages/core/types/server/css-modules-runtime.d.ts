export declare function installCssModulesRuntime(): void;
/**
 * Called by the dev server after a `.module.css` edit. Editing rules keeps the
 * class names (they depend only on the path), so a stylesheet swap is enough;
 * adding or removing a class changes the map already baked into the running
 * server's imports and the client's JS, which needs a restart. Returns true in
 * that case. Files the server never imported report false.
 */
export declare function cssModuleClassesChanged(path: string): Promise<boolean>;
