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

  const devOverlay = isDev() ? errorOverlayScript + "\n" : "";
  const metaHtml = renderMetaTags(mergeMeta(options.meta ?? []));
  // Include manifest + routeFile so the client can pre-import the route module
  // before hydrateRoot(), preventing the SSR/client tree mismatch.
  const bootstrapScriptContent =
    devOverlay + `window.__BRACTJS_DATA__=${safeStringify({ loaderData, actionData, params, pathname, manifest, routeFile: options.routeFile, meta: metaHtml })};`;

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
    },
  });
}
