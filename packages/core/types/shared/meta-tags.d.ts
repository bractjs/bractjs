import { type ReactElement } from "react";
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
export declare function MetaTags({ meta }: {
    meta: MetaDescriptor[];
}): ReactElement;
