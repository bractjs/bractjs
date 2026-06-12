import { join } from "node:path";
import { buildFetchHandler } from "../server/serve.ts";
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
export function prerenderPaths(path: string): { html: string; data: string } {
  if (!path.startsWith("/")) {
    throw new Error(`[bractjs] prerender: paths must start with "/", got ${JSON.stringify(path)}`);
  }
  if (path.includes(":") || path.includes("[") || path.includes("*")) {
    throw new Error(
      `[bractjs] prerender: ${JSON.stringify(path)} looks like a route PATTERN — ` +
        `expand dynamic routes to concrete paths (e.g. "/blog/intro", not "/blog/:slug").`,
    );
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.some((s) => s === ".." || s === ".")) {
    throw new Error(`[bractjs] prerender: refusing path with dot segments: ${JSON.stringify(path)}`);
  }
  const dir = segments.join("/");
  return {
    html: dir === "" ? "index.html" : `${dir}/index.html`,
    data: dir === "" ? "_data.json" : `${dir}/_data.json`,
  };
}

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
export async function runPrerender(options: PrerenderOptions): Promise<PrerenderResult> {
  const buildDir = options.buildDir ?? "./build";
  const paths = typeof options.prerender === "function" ? await options.prerender() : options.prerender;

  const handler = buildFetchHandler({
    appDir: options.appDir ?? "./app",
    publicDir: options.publicDir,
    buildDir,
    manifest: options.manifest,
  });

  const written: string[] = [];
  for (const path of paths) {
    const out = prerenderPaths(path);

    const htmlRes = await handler(new Request("http://prerender.local" + path));
    if (htmlRes.status !== 200) {
      throw new Error(`[bractjs] prerender: GET ${path} returned ${htmlRes.status}`);
    }
    const htmlFile = join(buildDir, "client", "_prerender", out.html);
    await Bun.write(htmlFile, await htmlRes.text());
    written.push(htmlFile);

    const dataRes = await handler(
      new Request("http://prerender.local/_data?path=" + encodeURIComponent(path)),
    );
    if (dataRes.status === 200) {
      const dataFile = join(buildDir, "client", "_prerender", out.data);
      await Bun.write(dataFile, await dataRes.text());
      written.push(dataFile);
    }
  }
  return { written };
}
