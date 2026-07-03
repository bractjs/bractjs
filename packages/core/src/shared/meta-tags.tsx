import { createElement, Fragment, type ReactElement } from "react";
import type { MetaDescriptor } from "./route-types.ts";

/**
 * Renders route `meta()` descriptors as document-metadata elements.
 *
 * React 19 automatically hoists `<title>`, `<meta>`, and `<link>` rendered
 * anywhere in the tree up into `<head>` — both during streaming SSR and on the
 * client. We render the merged descriptors here (inside the SSR shell AND the
 * ClientRouter tree) so:
 *   - crawlers and no-JS clients see real <title>/<meta> tags in the SSR HTML,
 *   - hydration matches the server tree (no mismatch warning),
 *   - soft navigation updates the document head by re-rendering this component.
 *
 * Keys are derived from the descriptor identity (title / name / property) so a
 * later route can override an earlier one without React duplicating the node.
 */
export function MetaTags({ meta }: { meta: MetaDescriptor[] }): ReactElement {
  const children: ReactElement[] = [];

  for (const d of meta) {
    if ("title" in d && typeof (d as { title: unknown }).title === "string") {
      const title = (d as { title: string }).title;
      children.push(createElement("title", { key: "title" }, title));
    } else if ("name" in d && "content" in d) {
      const { name, content } = d as { name: string; content: string };
      children.push(createElement("meta", { key: `name:${name}`, name, content }));
    } else if ("property" in d && "content" in d) {
      const { property, content } = d as { property: string; content: string };
      children.push(createElement("meta", { key: `prop:${property}`, property, content }));
    } else {
      // Arbitrary descriptor: render each string field as a meta attribute set.
      const entries = Object.entries(d).filter(([, v]) => typeof v === "string") as Array<[string, string]>;
      if (entries.length > 0) {
        const props: Record<string, string> = {};
        for (const [k, v] of entries) props[k] = v;
        const key = entries.map(([k, v]) => `${k}=${v}`).join("&");
        children.push(createElement("meta", { key: `raw:${key}`, ...props }));
      }
    }
  }

  return createElement(Fragment, null, ...children);
}
