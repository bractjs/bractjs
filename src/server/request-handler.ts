import { createElement } from "react";
import type { TrieNode } from "./matcher.ts";
import { matchRoute } from "./matcher.ts";
import { resolveRouteChain } from "./layout.ts";
import { runLoaders, runAction, buildLoaderArgs, runRouteContext, runBeforeLoad } from "./loader.ts";
import { renderRoute, type ServerManifest } from "./render.ts";
import { resolveMeta } from "./meta.ts";
import { json, error } from "./response.ts";
import { isRedirect, isHttpError } from "../shared/errors.ts";
import { isExplicitDev } from "./env.ts";
import { pipeline, type MiddlewareContext } from "./middleware.ts";
import { BractJSProvider } from "../shared/context.ts";
import { isAllowedMutation } from "./csrf.ts";

export interface HandlerConfig {
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// SECURITY(medium): cap form/multipart bodies for route mutations so a
// single client cannot exhaust memory. Multipart uploads of legitimate
// large files should use a dedicated upload endpoint configured separately.
const MAX_FORM_BYTES = 10 * 1_048_576; // 10 MiB

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
  // Exact-match: "/_data" only. "/_dataXYZ" must not reach here.
  if (pathname === "/_data") {
    // SECURITY(high): /_data must be GET-only. It runs loaders for the
    // target path; allowing POST/PUT/DELETE would bypass the CSRF gate that
    // protects route mutations and could trigger non-idempotent loader code.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return error("Method Not Allowed", 405);
    }
    // SECURITY(medium): `path` param is user-controlled and used to reconstruct a URL. matchRoute only matches registered routes (trie), so unmapped paths return 404 rather than accidentally proxying. Ensure the trie stays the single source of truth for what paths are reachable.
    const targetPath = searchParams.get("path") ?? "/";
    // Reject pathologically long path params to bound trie matching + URL parsing cost.
    if (targetPath.length > 2048) return json({ error: "Bad Request" }, { status: 400 });
    // Strip query string from path param so matching works on the pathname only.
    const [targetPathname, targetSearch] = targetPath.split("?");
    const match = matchRoute(targetPathname, trie);
    if (!match) return json({ error: "Not Found" }, { status: 404 });

    try {
      const chain = await resolveRouteChain(match.routeFile, appDir);
      // Reconstruct a Request that carries the original search params so loaders
      // can access them via request.url / new URL(request.url).searchParams.
      const targetUrl = new URL(request.url);
      targetUrl.pathname = targetPathname;
      targetUrl.search = targetSearch ? "?" + targetSearch : "";
      const loaderRequest = new Request(targetUrl.toString(), {
        headers: request.headers,
        method: "GET",
      });
      // SECURITY(high): /_data must run the same auth/redirect gates as a full
      // page request — otherwise a SPA-style soft navigation to a protected
      // route would bypass beforeLoad() / defineContext() and leak loader data.
      const routeContext = await runRouteContext(
        chain.route as Parameters<typeof runRouteContext>[0],
        loaderRequest,
        match.params,
        context,
      );
      const args = buildLoaderArgs(loaderRequest, match.params, routeContext);
      const beforeLoadResponse = await runBeforeLoad(chain.route, args);
      if (beforeLoadResponse) return beforeLoadResponse;
      const results = await runLoaders(chain, args);
      return json({ root: results.root, layouts: results.layouts, route: results.route, params: match.params });
    } catch (err) {
      if (isRedirect(err)) return err as Response;
      if (isHttpError(err)) return json({ error: err.message }, { status: err.status });
      console.error("[bractjs] /_data error:", err);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // ── Route matching ────────────────────────────────────────────────────
  const match = matchRoute(pathname, trie);
  if (!match) return error("Not Found", 404);

  const chain = await resolveRouteChain(match.routeFile, appDir);
  // Run per-route context factory (defineContext export) before loaders.
  const routeContext = await runRouteContext(
    chain.route as Parameters<typeof runRouteContext>[0],
    request,
    match.params,
    context,
  );
  const args = buildLoaderArgs(request, match.params, routeContext);

  // ── beforeLoad ────────────────────────────────────────────────────────
  const beforeLoadResponse = await runBeforeLoad(chain.route, args);
  if (beforeLoadResponse) return beforeLoadResponse;

  // ── Action (mutating methods) ─────────────────────────────────────────
  let actionData: unknown = null;
  if (MUTATING_METHODS.has(request.method)) {
    if (!isAllowedMutation(request)) return error("Forbidden", 403);
    // Reject up front if the client advertises an oversized body.
    const clRaw = request.headers.get("Content-Length");
    if (clRaw) {
      const cl = Number(clRaw);
      if (Number.isFinite(cl) && cl > MAX_FORM_BYTES) {
        return error("Payload Too Large", 413);
      }
    }
    try {
      const ct = request.headers.get("Content-Type") ?? "";
      const isFormLike = ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
      const formData = isFormLike ? await request.formData() : new FormData();
      actionData = await runAction(chain.route, { ...args, formData });
    } catch (err) {
      if (isRedirect(err)) return err as Response;
      if (isHttpError(err)) return error(err.message, err.status);
      if (isExplicitDev()) return error(err instanceof Error ? err.message : String(err), 500);
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
    if (isExplicitDev()) return error(err instanceof Error ? err.message : String(err), 500);
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
