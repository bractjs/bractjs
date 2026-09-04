import { createElement, Fragment, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { errorOverlayScript } from "../dev/error-overlay.ts";
import { MetaTags } from "../shared/meta-tags.tsx";
import { CspNonceContext } from "../shared/nonce-context.tsx";
import {
  baseCssHrefs,
  CSS_PRECEDENCE_BASE,
  CSS_PRECEDENCE_ROUTE,
  routeCssHrefs,
  StyleLinks,
} from "../shared/style-links.tsx";
import type { MetaDescriptor, RouteMatch } from "../shared/route-types.ts";
import { getDevHmrPort, isDevRuntime, safeStringify } from "./env.ts";
import { mergeMeta } from "./meta.ts";

export interface ServerManifest {
  clientEntry: string;
  rootChunk?: string;
  /** CSS reachable from the client entry — linked on every document. */
  entryCss?: string[];
  /** CSS imported by `app/root.tsx` — linked on every document. */
  rootCss?: string[];
  routes: Record<string, { file: string; chunk?: string; imports?: string[]; css?: string[] }>;
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
  const bootstrapScriptContent =
    devOverlay +
    `window.__BRACTJS_DATA__=${safeStringify({ loaderData, actionData, params, pathname, search: options.search, manifest, routeFile: options.routeFile, meta: mergedMeta, matches: options.matches, ssrMode: options.ssrMode })};`;

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
      createElement(StyleLinks, { hrefs: baseCssHrefs(manifest), precedence: CSS_PRECEDENCE_BASE }),
      createElement(StyleLinks, {
        hrefs: routeCssHrefs(manifest, options.routePattern),
        precedence: CSS_PRECEDENCE_ROUTE,
      }),
      shell,
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
    onError(error) {
      renderError = error;
      console.error("[bract] renderToReadableStream error:", error);
    },
  });

  const responseStatus = renderError ? 500 : status;

  const headers = new Headers({
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

  return new Response(stream, { status: responseStatus, headers });
}
