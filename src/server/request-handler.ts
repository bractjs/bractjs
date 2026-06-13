import { createElement } from "react";
import type { TrieNode } from "./matcher.ts";
import { matchRoute } from "./matcher.ts";
import { resolveRouteChain, type ModuleRegistry } from "./layout.ts";
import { runLoaders, runAction, buildLoaderArgs, runRouteContext, runBeforeLoad } from "./loader.ts";
import { validateSearch } from "./search.ts";
import { renderRoute, type ServerManifest } from "./render.ts";
import { resolveMeta, mergeMeta } from "./meta.ts";
import { json, error, sanitizeRedirect } from "./response.ts";
import { isRedirect, isHttpError } from "../shared/errors.ts";
import { isExplicitDev } from "./env.ts";
import { pipeline, type MiddlewareContext } from "./middleware.ts";
import { BractJSProvider } from "../shared/context.ts";
import { isAllowedMutation, csrfForbiddenResponse } from "./csrf.ts";
import { getCspNonce } from "./csp.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";

export interface HandlerConfig {
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
  onError?: OnErrorHook;
  /**
   * Pre-loaded route/layout/root modules keyed by appDir-relative path.
   * Provided by codegen (`_generated/routes.ts`) for compiled binaries
   * where dynamic `import(absPath)` is unavailable. Falsy in dev mode.
   */
  moduleRegistry?: ModuleRegistry;
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
  const { appDir, manifest, onError, moduleRegistry } = config;
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
      const chain = await resolveRouteChain(match.routeFile, appDir, moduleRegistry);
      // Reconstruct a Request that carries the original search params so loaders
      // can access them via request.url / new URL(request.url).searchParams.
      const targetUrl = new URL(request.url);
      targetUrl.pathname = targetPathname;
      targetUrl.search = targetSearch ? "?" + targetSearch : "";
      const loaderRequest = new Request(targetUrl.toString(), {
        headers: request.headers,
        method: "GET",
      });
      // Validate search params before any route work runs — loaders must
      // never see unvalidated input, and a 400 here is cheaper than a wasted
      // context-factory/loader run. The thrown 400 Response propagates below.
      const search = await validateSearch(chain.route.searchSchema, targetUrl);
      // SECURITY(high): /_data must run the same auth/redirect gates as a full
      // page request — otherwise a SPA-style soft navigation to a protected
      // route would bypass beforeLoad() / defineContext() and leak loader data.
      const routeContext = await runRouteContext(
        chain.route as Parameters<typeof runRouteContext>[0],
        loaderRequest,
        match.params,
        context,
      );
      const args = buildLoaderArgs(loaderRequest, match.params, routeContext, search);
      const beforeLoadResponse = await runBeforeLoad(chain.route, args);
      if (beforeLoadResponse) return beforeLoadResponse;
      const results = await runLoaders(chain, args, onError);
      // Merged meta must ride along: ClientRouter re-renders the document head
      // from this payload on soft navigation, and the initial __BRACTJS_DATA__
      // already carries the merged shape.
      const meta = mergeMeta(resolveMeta(chain, results, match.params));
      return json({ root: results.root, layouts: results.layouts, route: results.route, params: match.params, meta, search });
    } catch (err) {
      if (isRedirect(err)) return sanitizeRedirect(err as Response, request.url);
      // A non-redirect Response (e.g. the 400 thrown by search validation)
      // is the intended reply — pass it through verbatim.
      if (err instanceof Response) return err;
      if (isHttpError(err)) return json({ error: err.message }, { status: err.status });
      console.error("[bractjs] /_data error:", err);
      await fireOnError(onError, err, request);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // ── Route matching ────────────────────────────────────────────────────
  const match = matchRoute(pathname, trie);
  if (!match) return error("Not Found", 404);

  const chain = await resolveRouteChain(match.routeFile, appDir, moduleRegistry);

  // Validate search params before any route work (context factory, beforeLoad,
  // action, loaders) — they all receive the validated object.
  let search: Record<string, unknown>;
  try {
    search = await validateSearch(chain.route.searchSchema, url);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // Run per-route context factory (defineContext export) before loaders.
  const routeContext = await runRouteContext(
    chain.route as Parameters<typeof runRouteContext>[0],
    request,
    match.params,
    context,
  );
  const args = buildLoaderArgs(request, match.params, routeContext, search);

  // ── beforeLoad ────────────────────────────────────────────────────────
  const beforeLoadResponse = await runBeforeLoad(chain.route, args);
  if (beforeLoadResponse) return beforeLoadResponse;

  // ── Action (mutating methods) ─────────────────────────────────────────
  let actionData: unknown = null;
  if (MUTATING_METHODS.has(request.method)) {
    if (!isAllowedMutation(request)) return csrfForbiddenResponse();
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
      if (isRedirect(err)) return sanitizeRedirect(err as Response, request.url);
      if (isHttpError(err)) return error(err.message, err.status);
      // Name the failing route so the log points at the right file.
      console.error(`[bractjs] action error in ${chain.files?.route ?? match.routeFile.filePath}:`, err);
      await fireOnError(onError, err, request);
      if (isExplicitDev()) return error(err instanceof Error ? err.message : String(err), 500);
      return error("Internal Server Error", 500);
    }

    // An action may *return* (not just throw) a redirect or any Response —
    // the documented pattern is `return redirect("/")`. Propagate it verbatim
    // so the browser/`<Form>` sees a real 3xx (and follows it) instead of a
    // 200 with the Response serialized into a JSON body. sanitizeRedirect()
    // neutralizes an off-origin Location that didn't go through redirect()'s
    // allowExternal opt-in (e.g. a raw `new Response(…,{Location:"//evil"})`).
    if (actionData instanceof Response) return sanitizeRedirect(actionData, request.url);

    // Client-side Form submits with this header — return JSON, not HTML.
    if (request.headers.get("X-BractJS-Action")) {
      return json(actionData ?? null);
    }
  }

  // ── Selective SSR ─────────────────────────────────────────────────────
  // `ssr: false` skips the ROUTE loader during document SSR (root/layout
  // loaders still run — they render the shell). beforeLoad already ran above:
  // it is the auth gate and must hold for every mode. The client completes
  // the render via /_data after hydration, where the loader DOES run.
  const routeSsr = chain.route.ssr ?? true;
  const loaderChain = routeSsr === false
    ? { ...chain, route: { ...chain.route, loader: undefined } }
    : chain;

  // ── Loaders ───────────────────────────────────────────────────────────
  let loaderResults;
  try {
    loaderResults = await runLoaders(loaderChain, args, onError);
  } catch (err) {
    if (isRedirect(err)) return sanitizeRedirect(err as Response, request.url);
    if (isHttpError(err)) return error(err.message, err.status);
    await fireOnError(onError, err, request);
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
  // Non-default SSR modes render the Fallback (or nothing) in the component's
  // place; the client swaps in the real component after hydration.
  const RouteComponent = routeSsr === true ? chain.route.default : chain.route.Fallback;
  const ssrMode = routeSsr === true ? undefined : routeSsr === false ? "client-only" as const : "data-only" as const;

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
        location: { pathname, search: url.search, hash: "", state: null, key: "default" },
        search,
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
    search,
    manifest,
    meta,
    routeFile: match.routeFile.filePath,
    // Set by the opt-in csp() middleware; undefined otherwise.
    nonce: getCspNonce(context),
    ssrMode,
  });
}
