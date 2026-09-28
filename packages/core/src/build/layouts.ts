import { join, resolve } from "node:path";
import { layoutDirsFromFilePath, type RouteFile } from "../server/scanner.ts";

// Intermediate layout.tsx components are client entry-points like routes, so
// the browser can render the same root → layouts → route tree the server
// renders. Both builders (production bundler, dev rebuilder) use these helpers
// so their manifests agree.

/**
 * Each route's layout files, appDir-relative (`routes/blog/layout.tsx`),
 * outermost → innermost. Mirrors the server's resolveLayoutChain: per
 * directory, `layout.tsx` wins over `layout.ts`.
 */
export async function routeLayoutFiles(appDir: string, routes: RouteFile[]): Promise<Map<string, string[]>> {
  const exists = new Map<string, boolean>();
  const byPattern = new Map<string, string[]>();
  for (const route of routes) {
    const files: string[] = [];
    for (const dir of layoutDirsFromFilePath(route.filePath)) {
      for (const ext of ["tsx", "ts"]) {
        const rel = `routes/${dir}/layout.${ext}`;
        if (!exists.has(rel)) exists.set(rel, await Bun.file(resolve(appDir, rel)).exists());
        if (exists.get(rel)) {
          files.push(rel);
          break;
        }
      }
    }
    byPattern.set(route.urlPattern, files);
  }
  return byPattern;
}

/** The expected output path (relative to the client outdir) of an appDir-relative source file. */
export function outputRelPath(appDirClean: string, sourceRel: string): string {
  return join(appDirClean, sourceRel).replace(/\.[^.]+$/, ".js");
}

/**
 * Attach layout chunks to each route, and put layout CSS ahead of the route's
 * own so the route wins the cascade. Mutates `routeCss`; returns the
 * pattern → layout chunk URLs map for the manifest.
 */
export function attachLayouts(
  layoutFilesByPattern: Map<string, string[]>,
  layoutChunks: Map<string, string>,
  layoutCss: Map<string, string[]>,
  routeCss: Map<string, string[]>,
): Map<string, string[]> {
  const routeLayouts = new Map<string, string[]>();
  for (const [pattern, files] of layoutFilesByPattern) {
    const chunks = files.map((f) => layoutChunks.get(f)).filter((c): c is string => Boolean(c));
    if (chunks.length) routeLayouts.set(pattern, chunks);
    const css = [...new Set([...files.flatMap((f) => layoutCss.get(f) ?? []), ...(routeCss.get(pattern) ?? [])])];
    if (css.length) routeCss.set(pattern, css);
  }
  return routeLayouts;
}
