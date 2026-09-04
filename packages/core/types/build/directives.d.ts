import type { BunPlugin } from "bun";
import { hasClientDirective, hasServerDirective } from "../shared/directives.ts";
export { hasClientDirective, hasServerDirective };
export declare function extractExports(src: string): string[];
/** Server build: stub "use client" modules → null components to prevent browser API crashes. */
export declare const useClientStubPlugin: BunPlugin;
/**
 * Client build: replace "use server" exports with fetch proxy stubs.
 *
 * Factory form so the plugin can compute appDir-relative action IDs that
 * match the server registry across machines and inside compiled binaries.
 * Pass the same `appDir` used by `loadServerActions` on the server.
 */
export declare function createUseServerProxyPlugin(appDir?: string): BunPlugin;
/**
 * Backwards-compatible default — hashes by absolute path. New code should
 * call `createUseServerProxyPlugin(appDir)` so IDs are stable across the
 * client bundle and server registry regardless of where the build runs.
 */
export declare const useServerProxyPlugin: BunPlugin;
