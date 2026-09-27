import type { BunPlugin } from "bun";
/** Subset of config fields relevant to the build pipeline. */
export interface BuildConfig {
    appDir?: string;
    buildDir?: string;
    /** Client bundle sourcemaps. Default `"none"`: build/client/ is publicly served, so maps would publish module source. */
    sourcemap?: "none" | "linked" | "inline" | "external";
    minify?: boolean;
    clientEnv?: string[];
    plugins?: BunPlugin[];
    /** SPA mode: when `false`, the build also emits the static document shell. */
    ssr?: boolean;
    /** Compile Tailwind v4 as part of the CSS graph (no separate CLI step). */
    tailwind?: boolean;
}
export declare function runBuild(config: BuildConfig): Promise<void>;
