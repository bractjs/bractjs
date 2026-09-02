import { type BractAdapter } from "./adapter.ts";
import type { ModuleRegistry } from "./layout.ts";
import { type OnErrorHook } from "./lifecycle.ts";
import type { ServerManifest } from "./render.ts";
import { type RouteFile } from "./scanner.ts";
export interface I18nConfig {
    locales: string[];
    defaultLocale: string;
}
export interface BractJSConfig {
    port: number;
    appDir: string;
    publicDir: string;
    manifest: ServerManifest;
    /** WebSocket port for dev HMR (used by `bractjs dev` only). Default 3001. */
    hmrPort?: number;
    /** Optional custom adapter (Cloudflare Workers, Deno, Node, etc.). Defaults to Bun.serve(). */
    adapter?: BractAdapter;
    /** i18n locale prefix routing (E2). */
    i18n?: I18nConfig;
    /**
     * SPA mode: `false` serves one static shell for every document GET instead
     * of SSR. The server keeps running — /_data, actions, /_image, API routes
     * and static assets behave exactly as in SSR mode ("no document SSR", not
     * "no server"). Default `true`.
     */
    ssr?: boolean;
    /**
     * Paths to prerender at build time (SSG). Served from disk before dynamic
     * SSR in production; requests with a query string stay dynamic.
     */
    prerender?: string[] | (() => string[] | Promise<string[]>);
    sourcemap?: "none" | "linked" | "inline" | "external";
    minify?: boolean;
    clientEnv?: string[];
    /** User Bun bundler plugins appended to the client build. */
    plugins?: import("bun").BunPlugin[];
    /**
     * Compile Tailwind v4 as part of the CSS graph. Requires `bun-plugin-tailwind`
     * and `tailwindcss` in the app's devDependencies; import a stylesheet
     * containing `@import "tailwindcss";` from `app/root.tsx` (or a route) and
     * BractJS extracts, hashes, and `<link>`s it — no CLI step, no manual tag.
     */
    tailwind?: boolean;
    buildDir?: string;
    /** Directory for transformed image cache. Defaults to .bract-image-cache */
    imageCacheDir?: string;
    /**
     * Hard ceiling (bytes) on the size of any incoming request body, enforced by
     * the Bun adapter regardless of the advertised Content-Length. Defaults to
     * 16 MiB — above the 10 MiB route-form cap so normal requests pass while a
     * single client can't stream an unbounded body into memory. Raise it for a
     * dedicated large-upload endpoint. Only applies to the default Bun adapter.
     */
    maxRequestBodySize?: number;
    /** Called once after the server starts listening. Use to open DB connections, warm caches, etc. */
    onStart?: () => Promise<void> | void;
    /** Called before the process exits (any signal or uncaught error). Use to close DB connections, flush queues, etc. */
    onShutdown?: () => Promise<void> | void;
    /** Called for every unexpected error: loader failures, action throws, and uncaught process exceptions. Redirects and HttpErrors are intentional control flow and are NOT reported here. The request is undefined for process-level exceptions. */
    onError?: OnErrorHook;
    /**
     * Pre-scanned route list (typically exported from `app/_generated/routes.ts`).
     * When provided, skips the startup `Bun.Glob` scan of `appDir`. Required for
     * `bun build --compile` binaries where the embedded filesystem has no
     * scannable routes/ directory.
     */
    routeFiles?: RouteFile[];
    /**
     * Pre-loaded route/layout/root modules keyed by appDir-relative path.
     * Required alongside `routeFiles` for compiled binaries — `resolveRouteChain`
     * uses this map instead of `import(absPath)` at request time.
     */
    moduleRegistry?: ModuleRegistry;
    /**
     * Pre-imported server-action modules (typically `app/_generated/actions.ts`).
     * When provided, skips the startup `Bun.Glob` scan + dynamic import that
     * `loadServerActions` does.
     */
    actionModules?: Array<{
        relPath: string;
        mod: Record<string, unknown>;
    }>;
}
/**
 * Build the core application fetch handler.
 * This is adapter-agnostic: it returns a (request) => Promise<Response> function
 * that any adapter can call.
 */
export declare function buildFetchHandler(config: Partial<BractJSConfig>): (request: Request) => Promise<Response>;
export declare function setCreateServerSuppressed(v: boolean): void;
export declare function createServer(config?: Partial<BractJSConfig>): {
    stop(): void;
};
