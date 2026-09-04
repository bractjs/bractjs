import type { ServerManifest } from "../server/render.ts";
export interface PrerenderOptions {
    /** Concrete paths to prerender (or a function resolving them, e.g. from a DB). */
    prerender: string[] | (() => string[] | Promise<string[]>);
    appDir?: string;
    publicDir?: string;
    buildDir?: string;
    /** Override the manifest instead of loading `<buildDir>/route-manifest.json`. */
    manifest?: ServerManifest;
}
export interface PrerenderResult {
    written: string[];
}
/**
 * Where a path's prerendered files live under `<buildDir>/client/_prerender`.
 * Throws on anything that isn't a clean absolute path — these strings come
 * from user config but become filesystem writes.
 */
export declare function prerenderPaths(path: string): {
    html: string;
    data: string;
};
/**
 * Build-time prerendering (SSG): run the production fetch handler in-process
 * against each configured path and write the HTML document plus its `/_data`
 * payload (used by client navigations INTO a prerendered page) under
 * `<buildDir>/client/_prerender/`. The production server serves these before
 * falling back to dynamic SSR — query-carrying requests stay dynamic.
 *
 * Loaders run for real at build time: anything they need (DB, env) must be
 * available to the build.
 */
export declare function runPrerender(options: PrerenderOptions): Promise<PrerenderResult>;
