import type { BunPlugin } from "bun";
import type { RouteFile, RouteModule } from "./route.d.ts";

export interface BractJSConfig {
  /** TCP port to listen on. Default: 3000. */
  port: number;
  /** Absolute or relative path to the app directory (contains routes/, root.tsx). */
  appDir: string;
  /** Path to the public static assets directory. */
  publicDir: string;
  /** Pre-built server manifest (production). Built by runBuild(). */
  manifest: ServerManifest;
  /** Directory where build output is written. Default: "./build". */
  buildDir?: string;
  /** Source map strategy passed to Bun.build(). Default: "external". */
  sourcemap?: "none" | "linked" | "inline" | "external";
  /** Minify client bundles. Default: true in production. */
  minify?: boolean;
  /** process.env keys allowed to be inlined into client bundles. */
  clientEnv?: string[];
  /** User Bun bundler plugins appended to the client build (e.g. bun-plugin-tailwind). */
  plugins?: BunPlugin[];
  /** Called once after the server starts listening. Use to open DB connections, warm caches, etc. */
  onStart?: () => Promise<void> | void;
  /** Called before the process exits (any signal or uncaught error). Use to close DB connections, flush queues, etc. */
  onShutdown?: () => Promise<void> | void;
  /**
   * Pre-scanned route list. Typically imported from `app/_generated/routes.ts`.
   * Required for `bun build --compile` binaries where the routes/ directory
   * isn't on a scannable filesystem.
   */
  routeFiles?: RouteFile[];
  /**
   * Pre-loaded route/layout/root modules keyed by appDir-relative path.
   * Typically imported from `app/_generated/routes.ts`.
   */
  moduleRegistry?: Record<string, RouteModule | Record<string, unknown>>;
  /**
   * Pre-imported server-action modules. Typically imported from
   * `app/_generated/actions.ts`. Each `relPath` MUST match what the client
   * proxy plugin hashed during the client build.
   */
  actionModules?: Array<{ relPath: string; mod: Record<string, unknown> }>;
  /**
   * SPA mode: `false` serves one static shell for every document GET instead
   * of SSR ("no document SSR", not "no server" — /_data, actions, images and
   * API routes keep working). Default `true`.
   */
  ssr?: boolean;
  /** Paths to prerender at build time (SSG); served from disk before dynamic SSR. */
  prerender?: string[] | (() => string[] | Promise<string[]>);
}

export interface ServerManifest {
  /** Hashed path to the main client entry bundle. */
  clientEntry: string;
  /** Hashed path to the root.tsx chunk (when emitted as a separate entry). */
  rootChunk?: string;
  /** Map of URL pattern → route asset info. */
  routes: Record<string, { file?: string; chunk?: string; imports?: string[] }>;
}

/** Subset of BractJSConfig used by the build pipeline. All fields optional. */
export interface BuildConfig {
  appDir?: string;
  buildDir?: string;
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  plugins?: import("bun").BunPlugin[];
  /** SPA mode: when `false`, the build also emits the static document shell. */
  ssr?: boolean;
}
