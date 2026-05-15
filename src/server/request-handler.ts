import { createElement } from "react";
import type { TrieNode } from "./matcher.ts";
import { matchRoute } from "./matcher.ts";
import { resolveRouteChain } from "./layout.ts";
import { runLoaders, runAction, buildLoaderArgs } from "./loader.ts";
import { renderRoute, type ServerManifest } from "./render.ts";
import { resolveMeta } from "./meta.ts";
import { json, error } from "./response.ts";
import { isRedirect, isHttpError } from "../shared/errors.ts";
import { isDev } from "./env.ts";
import { pipeline, type MiddlewareContext } from "./middleware.ts";
import { BractJSProvider } from "../shared/context.ts";
import { isAllowedMutation } from "./csrf.ts";

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
  const { appDir, manifest } = config;
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

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
    if (!isAllowedMutation(request)) return error("Forbidden", 403);
    try {
      const ct = request.headers.get("Content-Type") ?? "";
      const isFormLike = ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
      const formData = isFormLike ? await request.formData() : new FormData();
      actionData = await runAction(chain.route, { ...args, formData });
    } catch (err) {
      if (isRedirect(err)) return err as Response;
      if (isHttpError(err)) return error(err.message, err.status);
      if (isDev()) return error(err instanceof Error ? err.message : String(err), 500);
      return error("Internal Server Error", 500);
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
    if (isHttpError(err)) return error(err.message, err.status);
    if (isDev()) return error(err instanceof Error ? err.message : String(err), 500);
    return error("Internal Server Error", 500);
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
