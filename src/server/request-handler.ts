import { join } from "node:path";
import { createElement } from "react";
import type { TrieNode } from "./matcher.ts";
import { matchRoute } from "./matcher.ts";
import { resolveRouteChain } from "./layout.ts";
import { runLoaders, runAction, buildLoaderArgs } from "./loader.ts";
import { renderRoute, type ServerManifest } from "./render.ts";
import { resolveMeta } from "./meta.ts";
import { json, error } from "./response.ts";
import { isRedirect } from "../shared/errors.ts";
import { pipeline, type MiddlewareContext } from "./middleware.ts";
import { BractJSProvider } from "../shared/context.ts";

export interface HandlerConfig {
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

export async function handleRequest(
  request: Request,
  trie: TrieNode,
  config: HandlerConfig
): Promise<Response> {
  const ctx: MiddlewareContext = {
    request,
    params: {},
    context: {},
  };

  return pipeline.run(ctx, () => route(request, trie, config, ctx.context));
}

async function route(
  request: Request,
  trie: TrieNode,
  config: HandlerConfig,
  context: Record<string, unknown>,
): Promise<Response> {
  const { appDir, publicDir, manifest } = config;
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  // ── Static public assets ──────────────────────────────────────────────
  if (pathname.startsWith("/public/")) {
    const file = Bun.file(join(publicDir, pathname.slice("/public/".length)));
    if (await file.exists()) return new Response(file);
    return error("Not Found", 404);
  }

  // ── /_data soft-nav JSON endpoint ─────────────────────────────────────
  if (pathname.startsWith("/_data")) {
    const targetPath = searchParams.get("path") ?? "/";
    const match = matchRoute(targetPath, trie);
    if (!match) return json({ error: "Not Found" }, { status: 404 });

    try {
      const chain = await resolveRouteChain(match.routeFile, appDir);
      const args = buildLoaderArgs(request, match.params, {});
      const results = await runLoaders(chain, args);
      return json({ root: results.root, layouts: results.layouts, route: results.route, params: match.params });
    } catch (err) {
      console.error("[bractjs] /_data error:", err);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // ── Route matching ────────────────────────────────────────────────────
  const match = matchRoute(pathname, trie);
  if (!match) return error("Not Found", 404);

  const chain = await resolveRouteChain(match.routeFile, appDir);
  const args = buildLoaderArgs(request, match.params, context);

  // ── Action (mutating methods) ─────────────────────────────────────────
  let actionData: unknown = null;
  if (MUTATING_METHODS.has(request.method)) {
    try {
      const formData = await request.formData();
      actionData = await runAction(chain.route, { ...args, formData });
    } catch (err) {
      if (isRedirect(err)) return err as Response;
      throw err;
    }

    // Client-side Form submits with this header — return JSON, not HTML.
    if (request.headers.get("X-BractJS-Action")) {
      return json(actionData ?? null);
    }
  }

  // ── Loaders ───────────────────────────────────────────────────────────
  let loaderResults;
  try {
    loaderResults = await runLoaders(chain, args);
  } catch (err) {
    if (isRedirect(err)) return err as Response;
    throw err;
  }

  const loaderData = {
    root: loaderResults.root,
    layouts: loaderResults.layouts,
    route: loaderResults.route,
  };

  // ── SSR render ────────────────────────────────────────────────────────
  const RootComponent = chain.root.default ?? (() => null);
  const RouteComponent = chain.route.default;

  // Wrap root in BractJSProvider so <Outlet> can render the route component
  // server-side without needing a ClientRouter.
  const shell = createElement(
    BractJSProvider,
    {
      value: {
        loaderData: loaderData as Record<string, unknown>,
        actionData,
        params: match.params,
        pathname,
        manifest: manifest as unknown as import("../shared/context.ts").RouteManifest,
        RouteComponent,
      },
      children: createElement(RootComponent),
    },
  );

  const meta = resolveMeta(chain, loaderResults, match.params);

  return renderRoute({
    shell,
    loaderData,
    actionData,
    params: match.params,
    pathname,
    manifest,
    meta,
    routeFile: match.routeFile.filePath,
  });
}
