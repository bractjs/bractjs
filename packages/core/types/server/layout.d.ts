import type { RouteModule } from "../shared/route-types.ts";
import { type RouteFile } from "./scanner.ts";
export interface LayoutChain {
    root: RouteModule;
    layouts: RouteModule[];
    route: RouteModule;
    /**
     * appDir-relative source paths for each module in the chain, for error
     * messages ("loader error in routes/blog/[id].tsx"). Optional so hand-built
     * chains in tests don't have to supply it.
     */
    files?: {
        root?: string;
        layouts: string[];
        route?: string;
    };
}
export interface ResolvedRoute extends RouteFile {
    layoutFiles: string[];
}
/**
 * Pre-loaded module map keyed by appDir-relative path (e.g. "root.tsx",
 * "routes/blog/layout.tsx"). When `resolveRouteChain` is called with a
 * registry, all module lookups go through the registry instead of dynamic
 * `import(absPath)` — this is what makes `bun build --compile` viable.
 */
export type ModuleRegistry = Record<string, RouteModule | Record<string, unknown>>;
export declare function resolveLayoutChain(routeFile: RouteFile, appDir: string): Promise<ResolvedRoute>;
/**
 * Registry-driven equivalent of `resolveLayoutChain`. Skips all filesystem
 * checks — returns the appDir-relative keys that exist in the registry, in
 * the same root-first, outermost-to-innermost order. Required for compiled
 * binaries where `Bun.file().exists()` against the original app paths is
 * unreliable.
 */
export declare function resolveLayoutChainFromRegistry(routeFile: RouteFile, registry: ModuleRegistry): ResolvedRoute;
export declare function importRouteModule(filePath: string): Promise<RouteModule>;
/**
 * Build the route + layout chain for a matched route.
 *
 * Two modes:
 * - Registry mode (production / compiled binary): when `registry` is provided,
 *   no filesystem checks and no dynamic imports run. Every module lookup is a
 *   `Record` access keyed by appDir-relative path.
 * - Dev mode (no registry): existing filesystem-probe + `import(absPath)`
 *   path, used by `bractjs dev` so edits to layouts/routes don't require a
 *   codegen rerun.
 */
export declare function resolveRouteChain(routeFile: RouteFile, appDir: string, registry?: ModuleRegistry): Promise<LayoutChain>;
