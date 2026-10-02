import { type I18nConfig } from "../shared/i18n.ts";
import { type ModuleRegistry } from "./layout.ts";
import { type OnErrorHook } from "./lifecycle.ts";
import type { TrieNode } from "./matcher.ts";
import { type ServerManifest } from "./render.ts";
export interface HandlerConfig {
    appDir: string;
    publicDir: string;
    manifest: ServerManifest;
    onError?: OnErrorHook;
    /**
     * Pre-loaded route/layout/root modules keyed by appDir-relative path.
     * Provided by codegen (`_generated/routes.ts`) for compiled binaries
     * where dynamic `import(absPath)` is unavailable. Falsy in dev mode.
     */
    moduleRegistry?: ModuleRegistry;
    /** See `BractJSConfig.streamTimeout`. */
    streamTimeout?: number;
    /** See `BractJSConfig.i18n`: locale prefixes are stripped before matching. */
    i18n?: I18nConfig;
}
export declare function handleRequest(request: Request, trie: TrieNode, config: HandlerConfig, context?: Record<string, unknown>): Promise<Response>;
