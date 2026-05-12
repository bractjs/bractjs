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
}

export interface ServerManifest {
  /** Hashed path to the main client entry bundle. */
  clientEntry: string;
  /** Map of URL pattern → route asset info. */
  routes: Record<string, { file?: string; chunk?: string }>;
}
