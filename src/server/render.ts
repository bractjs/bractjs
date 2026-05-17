import { renderToReadableStream } from "react-dom/server";
import type { ReactNode } from "react";
import type { MetaDescriptor } from "../shared/route-types.ts";
import { safeStringify, isDev } from "./env.ts";
import { errorOverlayScript } from "../dev/error-overlay.ts";
import { mergeMeta, renderMetaTags } from "./meta.ts";

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
  manifest: ServerManifest;
  meta: MetaDescriptor[];
  status?: number;
  /** Path of the matched route file (e.g. "routes/_index.tsx"), used by the client to pre-import the module before hydration. */
  routeFile?: string;
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

  const devFlag = isDev() ? "window.__BRACT_DEV__=true;" : "";
  const devOverlay = isDev() ? devFlag + errorOverlayScript + "\n" : "";
  const mergedMeta = mergeMeta(options.meta ?? []);
  // metaHtml is injected into <head> via React (the renderToReadableStream tree
  // is expected to use it). The merged descriptor array is what the client
  // reads — keep it shaped, not stringified HTML.
  const bootstrapScriptContent =
    devOverlay + `window.__BRACTJS_DATA__=${safeStringify({ loaderData, actionData, params, pathname, manifest, routeFile: options.routeFile, meta: mergedMeta })};`;

  let renderError: unknown;

  const stream = await renderToReadableStream(shell, {
    bootstrapScriptContent,
    bootstrapModules: [manifest.clientEntry],
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
      // SECURITY(medium): baseline hardening headers. Apps that need a tighter
      // CSP (e.g. with nonces for the inline bootstrap script) can override
      // via middleware. We omit CSP here because the inline bootstrap script
      // injected by safeStringify would require nonce wiring throughout.
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
