import { createElement, Fragment, type ReactElement } from "react";
import type { ServerManifest } from "../server/render.ts";

/**
 * Precedence tiers for framework-emitted stylesheets.
 *
 * React groups hoisted stylesheets by precedence and orders the groups by the
 * order it first saw them, so listing base before route gives a deterministic
 * cascade in which a route's styles win over app-wide ones regardless of which
 * route loaded first.
 */
export const CSS_PRECEDENCE_BASE = "bract-base";
export const CSS_PRECEDENCE_ROUTE = "bract-route";

/**
 * Renders extracted CSS bundles as `<link rel="stylesheet">` elements.
 *
 * React 19 hoists `<link>` into `<head>` from anywhere in the tree — the same
 * mechanism `<MetaTags>` relies on — so this works during streaming SSR and on
 * the client without the app having to hand-write a `<link>` in root.tsx.
 *
 * Passing `precedence` is what makes this correct rather than merely convenient:
 *   - React dedupes by href, so the server tree and the client tree agree and
 *     re-rendering on navigation never inserts a duplicate sheet;
 *   - on client navigation React waits for a newly-inserted stylesheet to load
 *     before committing the render, so a route swap cannot paint unstyled.
 *
 * SSR emits these into the streamed HTML, which is what makes the document
 * styled for crawlers and no-JS clients — the property the old runtime
 * `<style>`-injection approach could not provide.
 */
export function StyleLinks({ hrefs, precedence }: { hrefs: string[]; precedence: string }): ReactElement {
  return createElement(
    Fragment,
    null,
    ...hrefs.map((href) =>
      createElement("link", { key: href, rel: "stylesheet", href, precedence }),
    ),
  );
}

/**
 * The app-wide stylesheets: everything reachable from the client entry plus
 * whatever `app/root.tsx` imports. Linked on every document.
 */
export function baseCssHrefs(manifest: Pick<ServerManifest, "entryCss" | "rootCss">): string[] {
  return dedupe([...(manifest.entryCss ?? []), ...(manifest.rootCss ?? [])]);
}

/**
 * The stylesheets belonging to one matched route pattern. Returns `[]` for an
 * unmatched pattern or a route with no CSS, so callers can render
 * unconditionally.
 */
export function routeCssHrefs(manifest: Pick<ServerManifest, "routes">, pattern: string | null | undefined): string[] {
  if (!pattern) return [];
  return dedupe(manifest.routes?.[pattern]?.css ?? []);
}

function dedupe(hrefs: string[]): string[] {
  return hrefs.length > 1 ? [...new Set(hrefs)] : hrefs;
}
