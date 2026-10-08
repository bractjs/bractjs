import { type I18nConfig, localizePath } from "../shared/i18n.ts";
import { join } from "node:path";
import { createNoncePlaceholder, stampNoncePlaceholder } from "../server/csp.ts";
import {
  ISR_MANIFEST,
  type IsrManifest,
  markCachedRender,
  parseRevalidate,
  PRERENDER_HEADER,
  REVALIDATE_HEADER,
} from "../server/isr.ts";
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
  /** The app's `i18n`: each path is also prerendered in every non-default locale (`/fr/about`). */
  i18n?: I18nConfig;
  /** The app's public origin (`BractJSConfig.origin`): the `request.url` origin pages render with. */
  origin?: string;
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
  const listed = typeof options.prerender === "function" ? await options.prerender() : options.prerender;
  const i18n = options.i18n;
  const paths = i18n
    ? [...new Set(listed.flatMap((p) => i18n.locales.map((l) => localizePath(p, l, i18n))))]
    : listed;

  const origin = options.origin ? new URL(options.origin).origin : "http://prerender.local";
  const handler = buildFetchHandler({
    appDir: options.appDir ?? "./app",
    publicDir: options.publicDir,
    buildDir,
    manifest: options.manifest,
    i18n,
  });

  const written: string[] = [];
  const isrRoutes: Record<string, number> = {};
  for (const path of paths) {
    const out = prerenderPaths(path);

    // Rendered for the cache: CSP nonces become a fresh, unguessable
    // placeholder the server swaps for each visitor's own nonce. The document
    // file is stamped with it (stampNoncePlaceholder) so the server knows which.
    const placeholder = createNoncePlaceholder();
    const htmlRes = await handler(
      markCachedRender(new Request(origin + path, { headers: { [PRERENDER_HEADER]: "1" } }), placeholder),
    );
    if (htmlRes.status !== 200) {
      throw new Error(`[bractjs] prerender: GET ${path} returned ${htmlRes.status}`);
    }
    const revalidate = htmlRes.headers.get(REVALIDATE_HEADER);
    if (revalidate !== null) isrRoutes[path] = parseRevalidate(revalidate, path);
    const htmlFile = join(buildDir, "client", "_prerender", out.html);
    await Bun.write(htmlFile, stampNoncePlaceholder(await htmlRes.text(), placeholder));
    written.push(htmlFile);

    const dataRes = await handler(markCachedRender(new Request(origin + "/_data?path=" + encodeURIComponent(path)), placeholder));
    if (dataRes.status === 200) {
      const dataFile = join(buildDir, "client", "_prerender", out.data);
      await Bun.write(dataFile, await dataRes.text());
      written.push(dataFile);
    }
  }
  // ISR pages (route `config.revalidate`): the server regenerates these.
  if (Object.keys(isrRoutes).length) {
    const manifest: IsrManifest = { generatedAt: Date.now(), routes: isrRoutes };
    const file = join(buildDir, "client", "_prerender", ISR_MANIFEST);
    await Bun.write(file, JSON.stringify(manifest, null, 2));
    written.push(file);
  }
  return { written };
}
