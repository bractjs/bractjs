import { createElement, Fragment, type ReactElement } from "react";
import type { LinkDescriptor } from "./route-types.ts";

/** Precedence for stylesheets from route `links()` — after the framework's own CSS. */
export const CSS_PRECEDENCE_LINKS = "bract-links";

/**
 * Renders route `links()` descriptors as `<link>` elements. React 19 hoists
 * them into `<head>` (during streaming SSR and on the client), the same
 * mechanism `<MetaTags>` and `<StyleLinks>` use. A stylesheet gets a
 * `precedence` — required for React to hoist and dedupe it, and to hold a
 * client navigation until it has loaded.
 */
export function LinkTags({ links }: { links: LinkDescriptor[] }): ReactElement {
  return createElement(
    Fragment,
    null,
    ...links.map((l) => {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) {
        if (typeof v === "string" || typeof v === "boolean") props[k] = v;
      }
      if (l.rel === "stylesheet" && props.precedence === undefined) props.precedence = CSS_PRECEDENCE_LINKS;
      return createElement("link", { key: `${l.rel}|${l.href ?? JSON.stringify(l)}`, ...props });
    }),
  );
}
