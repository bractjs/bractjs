/** Root module file names, in precedence order. */
export declare const ROOT_FILES: readonly ["root.tsx", "root.ts"];
export type RootFileName = (typeof ROOT_FILES)[number];
/** The app's root module file name, or null when it has none. */
export declare function resolveRootFile(appDir: string): Promise<RootFileName | null>;
/** {@link resolveRootFile}, synchronously (build tooling). */
export declare function resolveRootFileSync(appDir: string): RootFileName | null;
/** The root module's key in a codegen'd module registry, if it has one. */
export declare function rootKeyIn(registry: Record<string, unknown>): RootFileName | undefined;
