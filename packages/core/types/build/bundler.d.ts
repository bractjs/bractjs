import type { BunPlugin } from "bun";
/** Subset of config fields relevant to the build pipeline. */
export interface BuildConfig {
    appDir?: string;
    buildDir?: string;
    sourcemap?: "none" | "linked" | "inline" | "external";
    minify?: boolean;
    clientEnv?: string[];
    plugins?: BunPlugin[];
    /** SPA mode: when `false`, the build also emits the static document shell. */
    ssr?: boolean;
}
export declare function runBuild(config: BuildConfig): Promise<void>;
