import { type ComponentType, createElement, Fragment, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { errorOverlayScript } from "../dev/error-overlay.ts";
import { LinkTags } from "../shared/link-tags.tsx";
import { MetaTags } from "../shared/meta-tags.tsx";
import { CspNonceContext } from "../shared/nonce-context.tsx";
import {
  baseCssHrefs,
  CSS_PRECEDENCE_BASE,
  CSS_PRECEDENCE_ROUTE,
  routeCssHrefs,
  StyleLinks,
} from "../shared/style-links.tsx";
import type { I18nConfig } from "../shared/i18n.ts";
import { RequestIdContext } from "../shared/request-id.ts";
import { getPublicEnv } from "../shared/define-env.ts";
import { HttpError } from "../shared/errors.ts";
import { RootErrorDocument } from "../shared/root-error-document.tsx";
import type { LinkDescriptor, MetaDescriptor, RouteMatch } from "../shared/route-types.ts";
import { appendDeferredScript, encodeDeferred } from "./deferred-wire.ts";
import { getDevHmrPort, isDevRuntime, safeStringify } from "./env.ts";
import { mergeMeta } from "./meta.ts";
import { getRequestId } from "./request-context.ts";

export interface ServerManifest {
  clientEntry: string;
  rootChunk?: string;
  /** CSS reachable from the client entry — linked on every document. */
  entryCss?: string[];
  /** CSS imported by `app/root.tsx` — linked on every document. */
  rootCss?: string[];
  routes: Record<
    string,
    {
      file: string;
      chunk?: string;
      imports?: string[];
      css?: string[];
      /** Layout chunk URLs, outermost → innermost — the client loads them to render the same tree. */
      layouts?: string[];
    }
  >;
}

export interface RenderOptions {
  shell: ReactNode;
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  /** Validated search params — hydrates `useSearch()` so the client never re-validates. */
  search?: Record<string, unknown>;
  manifest: ServerManifest;
  meta: MetaDescriptor[];
  /** Route `links()` descriptors (root → layouts → route), rendered into `<head>`. */
  links?: LinkDescriptor[];
  /** The matched route chain (root → layouts → route) for `useMatches()`. */
  matches?: RouteMatch[];
  status?: number;
  /** Path of the matched route file (e.g. "routes/_index.tsx"), used by the client to pre-import the module before hydration. */
  routeFile?: string;
  /**
   * URL pattern of the matched route (the manifest key), used to link that
   * route's extracted CSS. Omitted for the SPA shell, which has no matched
   * route — the client links route CSS once it resolves one.
   */
  routePattern?: string;
  /** Per-request CSP nonce (set by the opt-in `csp()` middleware). Applied to the inline bootstrap script + client entry module tags. */
  nonce?: string;
  /**
   * Set when the document did NOT SSR the route component: the client renders
   * the Fallback during hydration, then swaps in the real component
   * ("data-only": data already present; "client-only": after a /_data fetch;
   * "spa": static shell, everything resolved client-side).
   */
  ssrMode?: "client-only" | "data-only" | "spa";
  /**
   * Resolved route `headers()` output (root → layout → route merged). Applied
   * on top of the baseline document headers, overriding any same-key default.
   */
  headers?: Headers | null;
  /**
   * Abort the React render and fail still-pending `defer()` data after this
   * many ms (React Router's `streamTimeout`). Unset → no limit.
   */
  streamTimeout?: number;
  /** The page's locale and the app's i18n config, for the client router. */
  locale?: string;
  i18n?: I18nConfig;
}

export async function renderRoute(options: RenderOptions): Promise<Response> {
  const { shell, loaderData, actionData, params, pathname, manifest, status = 200 } = options;

  // In dev, publish the HMR port so the injected client connects to the
  // configured `hmrPort` rather than a hardcoded 3001. 0 → omit (client
  // defaults to 3001).
  const hmrPort = isDevRuntime() ? getDevHmrPort() : 0;
  const devFlag = isDevRuntime()
    ? "window.__BRACT_DEV__=true;" + (hmrPort ? `window.__BRACTJS_HMR_PORT__=${hmrPort};` : "")
    : "";
  const devOverlay = isDevRuntime() ? devFlag + errorOverlayScript + "\n" : "";
  const mergedMeta = mergeMeta(options.meta ?? []);
  // The merged descriptor array is what the client reads to keep the document
  // head in sync on soft navigation — keep it shaped, not stringified HTML.
  // defer() fields can't be JSON-serialized: the data island carries id markers
  // and the settled values follow at the end of the HTML stream.
  const requestId = getRequestId();
  const { payload: wire, pending: deferred } = encodeDeferred({ ...loaderData, matches: options.matches });
  const { matches: wireMatches, ...wireLoaderData } = wire;
  const bootstrapScriptContent =
    devOverlay +
    `window.__BRACTJS_DATA__=${safeStringify({ loaderData: wireLoaderData, actionData, params, pathname, search: options.search, manifest, routeFile: options.routeFile, meta: mergedMeta, matches: wireMatches, links: options.links?.length ? options.links : undefined, ssrMode: options.ssrMode, requestId, locale: options.locale, i18n: options.i18n, env: getPublicEnv() })};`;

  // Render <title>/<meta> elements alongside the app shell. React 19 hoists
  // document-metadata elements into <head> during streaming SSR, so crawlers
  // and no-JS clients receive real meta tags. The client renders the same
  // <MetaTags> inside ClientRouter, so hydration matches and soft navigation
  // re-renders the head.
  // CspNonceContext lets framework-emitted inline scripts deep in the app tree
  // (<LiveReload>'s HMR client) carry the per-request nonce.
  // Stylesheets are hoisted into <head> by React exactly like the meta tags
  // above, so the streamed HTML is styled on first paint — no FOUC, and no-JS
  // clients get real <link> tags. Base (entry + root) is listed before the
  // route's own CSS so the route wins the cascade.
  const tree = createElement(
    CspNonceContext.Provider,
    { value: options.nonce },
    createElement(
      Fragment,
      null,
      createElement(MetaTags, { meta: mergedMeta }),
      createElement(LinkTags, { links: options.links ?? [] }),
      createElement(StyleLinks, { hrefs: baseCssHrefs(manifest), precedence: CSS_PRECEDENCE_BASE }),
      createElement(StyleLinks, {
        hrefs: routeCssHrefs(manifest, options.routePattern),
        precedence: CSS_PRECEDENCE_ROUTE,
      }),
      createElement(RequestIdContext.Provider, { value: requestId }, shell),
    ),
  );

  let renderError: unknown;

  const stream = await renderToReadableStream(tree, {
    bootstrapScriptContent,
    bootstrapModules: [manifest.clientEntry],
    // When the opt-in csp() middleware ran, React stamps this nonce onto the
    // inline bootstrap script and the client entry <script type=module>, so
    // they satisfy a strict `script-src 'nonce-…'` policy.
    nonce: options.nonce,
    // streamTimeout: past it, React stops waiting on Suspense boundaries and
    // leaves them to the client (a hung promise can't hold the socket open).
    signal: options.streamTimeout ? AbortSignal.timeout(options.streamTimeout + 1_000) : undefined,
    onError(error) {
      renderError = error;
      console.error("[bract] renderToReadableStream error:", error);
    },
  });

  const responseStatus = renderError ? 500 : status;

  const headers = baselineDocumentHeaders();

  // Route `headers()` output (root → layout → route) overrides the baseline.
  // Content-Type / Transfer-Encoding stay framework-owned: a route shouldn't
  // be able to corrupt the streamed document envelope. Don't apply on render
  // errors — that path serves a generic 500, not the route's cached document.
  if (options.headers && !renderError) {
    options.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "content-type" || k === "transfer-encoding") return;
      headers.set(key, value);
    });
  }

  return new Response(appendDeferredScript(stream, deferred, options.nonce, options.streamTimeout), {
    status: responseStatus,
    headers,
  });
}

function baselineDocumentHeaders(): Headers {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Transfer-Encoding": "chunked",
    // SECURITY(medium): baseline hardening headers. For a Content-Security-
    // Policy, opt into the nonce-based `csp()` middleware — it generates a
    // per-request nonce, applies it to the inline bootstrap script + client
    // entry module here (via renderToReadableStream's `nonce` option), and
    // sets the CSP response header.
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
}

export interface RootErrorDocumentOptions {
  /** root.tsx's ErrorBoundary, else the built-in fallback. */
  Boundary: ComponentType<{ error: unknown }>;
  /** root.tsx's `Layout` export: when present, it renders the document around the boundary. */
  Layout?: ComponentType<{ children?: ReactNode }>;
  error: Error;
  params: Record<string, string>;
  pathname?: string;
  search?: string;
  manifest: ServerManifest;
  nonce?: string;
  status: number;
  locale?: string;
  i18n?: I18nConfig;
}

/**
 * The document for a failed root loader. root.tsx renders `<html>` itself and
 * needs its loader data to do so, so the framework owns this document: root's
 * `Layout` (or a minimal `<html>`), the app-wide stylesheets and root's
 * ErrorBoundary (shared/root-error-document.tsx). It ships the client entry,
 * which hydrates the same tree — the boundary's buttons and effects work, and
 * links are document loads that retry the app.
 */
export async function renderRootErrorDocument(options: RootErrorDocumentOptions): Promise<Response> {
  const { error, status, manifest } = options;
  const requestId = getRequestId();
  const pathname = options.pathname ?? "/";
  const search = options.search ?? "";
  const document = createElement(RootErrorDocument, {
    Boundary: options.Boundary,
    Layout: options.Layout,
    error,
    status,
    params: options.params,
    pathname,
    search,
    manifest,
    requestId,
    locale: options.locale,
    i18n: options.i18n,
  });
  // The client entry hydrates the same RootErrorDocument from this payload:
  // the root slot carries the error exactly as a failed loader leaves it.
  const rootError = {
    message: error.message,
    ...(error instanceof HttpError ? { status: error.status } : {}),
  };
  const hmrPort = isDevRuntime() ? getDevHmrPort() : 0;
  const devOverlay = isDevRuntime()
    ? "window.__BRACT_DEV__=true;" +
      (hmrPort ? `window.__BRACTJS_HMR_PORT__=${hmrPort};` : "") +
      errorOverlayScript +
      "\n"
    : "";
  const bootstrapScriptContent =
    devOverlay +
    `window.__BRACTJS_DATA__=${safeStringify({ loaderData: { root: { __error: rootError }, layouts: [] }, actionData: null, params: options.params, pathname, manifest, requestId, locale: options.locale, i18n: options.i18n, env: getPublicEnv(), rootError: { status } })};`;
  const tree = createElement(CspNonceContext.Provider, { value: options.nonce }, document);
  let renderError: unknown;
  let stream: ReadableStream;
  try {
    stream = await renderToReadableStream(tree, {
      bootstrapScriptContent,
      bootstrapModules: [manifest.clientEntry],
      nonce: options.nonce,
      onError(err) {
        renderError = err;
        console.error("[bract] root error document render error:", err);
      },
    });
  } catch {
    // The boundary itself threw: fall back to a bare, unstyled error page.
    return new Response(`<!DOCTYPE html><title>500</title><h1>500</h1>`, {
      status: 500,
      headers: baselineDocumentHeaders(),
    });
  }
  return new Response(stream, { status: renderError ? 500 : status, headers: baselineDocumentHeaders() });
}
