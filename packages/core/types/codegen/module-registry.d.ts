import { type RouteFile } from "../server/scanner.ts";
export interface RouteRegistryInput {
    appDir: string;
    routes: RouteFile[];
    layoutRelPaths: string[];
    hasRoot: boolean;
}
export declare function generateRouteRegistry(input: RouteRegistryInput): string;
export interface ActionRegistryInput {
    appDir: string;
    actionRelPaths: string[];
}
export declare function generateActionRegistry(input: ActionRegistryInput): string;
/**
 * Shape produced by `src/build/manifest.ts` (`RouteManifest`). Re-typed here
 * so the codegen module stays decoupled from the build pipeline.
 */
interface DiskManifest {
    version?: number;
    mode?: string;
    clientEntry: string;
    rootChunk?: string;
    routes: Record<string, {
        chunk: string;
        pattern: string;
    }>;
}
/**
 * Convert the disk-format manifest (RouteManifest) into a TypeScript module
 * exporting a `ServerManifest` constant. This decouples the compiled-binary
 * server entry from the disk manifest — at startup it imports the constant
 * instead of reading `build/route-manifest.json`.
 */
export declare function generateManifestModule(disk: DiskManifest): string;
/**
 * Read `<buildDir>/route-manifest.json` and write
 * `<appDir>/_generated/manifest.ts`. Must run AFTER the client `Bun.build()`
 * step — chunk filenames are content-hashed and not known until then.
 */
export declare function writeManifestModule(appDir: string, buildDir: string): Promise<string>;
export interface CodegenResult {
    routesPath: string;
    actionsPath: string;
}
export declare function writeModuleRegistries(appDir: string): Promise<CodegenResult>;
export {};
