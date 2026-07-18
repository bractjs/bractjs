import type { BractJSConfig } from "../server/serve.ts";
/**
 * Shallow shape check for a user-supplied config object. We don't validate
 * exhaustively (plugins/adapters/hooks are opaque), but we catch the common
 * mistakes early — a string `port`, a non-array `clientEnv`, etc. — so the
 * failure surfaces here with a clear message instead of deep inside the build
 * or the request path.
 */
export declare function validateUserConfig(cfg: unknown): Partial<BractJSConfig>;
/**
 * Identity helper for `bractjs.config.ts` — wrap your default export to get
 * autocomplete and type-checking on the config fields (no runtime effect):
 *
 * ```ts
 * import { defineConfig } from "@bractjs/bractjs";
 * export default defineConfig({ port: 3000, clientEnv: ["PUBLIC_API_URL"] });
 * ```
 */
export declare function defineConfig(config: Partial<BractJSConfig>): Partial<BractJSConfig>;
/**
 * Load `bractjs.config.ts` (or `.js`) from the user's cwd if present.
 * Returns an empty object when no file exists — callers fall back to defaults.
 */
export declare function loadUserConfig(): Promise<Partial<BractJSConfig>>;
