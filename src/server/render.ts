import { renderToReadableStream } from "react-dom/server";
import { createElement, Fragment, type ReactNode } from "react";
import type { MetaDescriptor } from "../shared/route-types.ts";
import { safeStringify, isDevRuntime } from "./env.ts";
import { errorOverlayScript } from "../dev/error-overlay.ts";
import { mergeMeta } from "./meta.ts";
import { MetaTags } from "../shared/meta-tags.tsx";

export interface ServerManifest {
  clientEntry: string;
  rootChunk?: string;
  routes: Record<string, { file: string; chunk?: string; imports?: string[] }>;
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
  status?: number;
  /** Path of the matched route file (e.g. "routes/_index.tsx"), used by the client to pre-import the module before hydration. */
  routeFile?: string;
  /** Per-request CSP nonce (set by the opt-in `csp()` middleware). Applied to the inline bootstrap script + client entry module tags. */
  nonce?: string;
  /**
   * Set when the document did NOT SSR the route component: the client renders
   * the Fallback during hydration, then swaps in the real component
   * ("data-only": data already present; "client-only": after a /_data fetch;
   * "spa": static shell, everything resolved client-side).
   */
  ssrMode?: "client-only" | "data-only" | "spa";
}

export async function renderRoute(options: RenderOptions): Promise<Response> {
  const {
    shell,
    loaderData,
    actionData,
    params,
    pathname,
    manifest,
    status = 200,
  } = options;

  const devFlag = isDevRuntime() ? "window.__BRACT_DEV__=true;" : "";
  const devOverlay = isDevRuntime() ? devFlag + errorOverlayScript + "\n" : "";
  const mergedMeta = mergeMeta(options.meta ?? []);
  // The merged descriptor array is what the client reads to keep the document
  // head in sync on soft navigation — keep it shaped, not stringified HTML.
  const bootstrapScriptContent =
    devOverlay + `window.__BRACTJS_DATA__=${safeStringify({ loaderData, actionData, params, pathname, search: options.search, manifest, routeFile: options.routeFile, meta: mergedMeta, ssrMode: options.ssrMode })};`;

  // Render <title>/<meta> elements alongside the app shell. React 19 hoists
  // document-metadata elements into <head> during streaming SSR, so crawlers
  // and no-JS clients receive real meta tags. The client renders the same
  // <MetaTags> inside ClientRouter, so hydration matches and soft navigation
  // re-renders the head.
  const tree = createElement(
    Fragment,
    null,
    createElement(MetaTags, { meta: mergedMeta }),
    shell,
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

  return new Response(stream, {
    status: responseStatus,
    headers: {
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
    },
  });
}
