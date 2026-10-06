import { type ComponentType, createElement, type ReactElement, type ReactNode } from "react";
import type { ServerManifest } from "../server/render.ts";
import { BractJSContext, type RouteManifest } from "./context.ts";
import type { I18nConfig } from "./i18n.ts";
import { RequestIdContext } from "./request-id.ts";
import { renderErrorBoundary } from "./route-error.ts";
import { baseCssHrefs, CSS_PRECEDENCE_BASE, StyleLinks } from "./style-links.tsx";

export interface RootErrorDocumentProps {
  /** root.tsx's ErrorBoundary, else the built-in fallback. */
  Boundary: ComponentType<{ error: unknown }>;
  /** root.tsx's `Layout` export: when present, it renders the document around the boundary. */
  Layout?: ComponentType<{ children?: ReactNode }>;
  error: Error;
  status: number;
  params: Record<string, string>;
  pathname: string;
  search: string;
  manifest: ServerManifest;
  requestId?: string;
  locale?: string;
  i18n?: I18nConfig;
}

/**
 * The document for a failed root loader: root.tsx's `Layout` (or a minimal
 * `<html>`) around root's ErrorBoundary, with the app-wide stylesheets. The
 * server renders it and the client hydrates the SAME tree (client/entry.tsx),
 * so the page is interactive. There is no router behind it: the root loader
 * failed, so `/_data` would fail too, and links are plain document loads that
 * try the app again.
 */
export function RootErrorDocument(props: RootErrorDocumentProps): ReactElement {
  const { Boundary, Layout, error, status, params, manifest } = props;
  const title = `${status} ${error.message}`.trim();
  const boundary = createElement(
    RequestIdContext.Provider,
    { value: props.requestId },
    renderErrorBoundary(Boundary, error, { params }),
  );
  if (!Layout) {
    return createElement(
      "html",
      { lang: "en" },
      createElement(
        "head",
        null,
        createElement("meta", { charSet: "utf-8" }),
        createElement("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
        createElement("title", null, title),
        createElement(StyleLinks, { hrefs: baseCssHrefs(manifest), precedence: CSS_PRECEDENCE_BASE }),
      ),
      createElement("body", null, boundary),
    );
  }
  // The app's own document. Hooks inside Layout see an empty route state —
  // like React Router, Layout must cope with missing loader data here.
  return createElement(
    BractJSContext.Provider,
    {
      value: {
        loaderData: { root: undefined, layouts: [], route: undefined },
        actionData: null,
        params,
        pathname: props.pathname,
        manifest: manifest as unknown as RouteManifest,
        location: { pathname: props.pathname, search: props.search, hash: "", state: null, key: "default" },
        search: {},
        matches: [],
        locale: props.locale,
        i18n: props.i18n,
      },
    },
    createElement(
      Layout,
      null,
      // React hoists <title> and precedence stylesheets into <head>.
      createElement("title", null, title),
      createElement(StyleLinks, { hrefs: baseCssHrefs(manifest), precedence: CSS_PRECEDENCE_BASE }),
      boundary,
    ),
  );
}
