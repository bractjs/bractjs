import { createElement } from "react";
import { BractJSProvider } from "../shared/context.ts";
import {
  type I18nConfig,
  LOCALE_COOKIE,
  localizePath,
  negotiateLocale,
  splitLocale,
} from "../shared/i18n.ts";
import { isHttpError, isRedirect } from "../shared/errors.ts";
import {
  firstLoaderFailure,
  type LoaderFailure,
  pickBoundaryForFailure,
  renderErrorBoundary,
  routeErrorStatus,
} from "../shared/route-error.ts";
import { getCspNonce } from "./csp.ts";
import { inheritClientAddress } from "./client-address.ts";
import { csrfForbiddenResponse, isAllowedMutation } from "./csrf.ts";
import { settleDeferred } from "./deferred-wire.ts";
import { isExplicitDev } from "./env.ts";
import { resolveHeaders } from "./headers.ts";
import { type ModuleRegistry, resolveRootChain, resolveRouteChain } from "./layout.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";
import {
  buildLoaderArgs,
  runAction,
  runBeforeLoad,
  runLoaders,
  runRouteContext,
  unwrapData,
} from "./loader.ts";
import type { TrieNode } from "./matcher.ts";
import { matchRoute } from "./matcher.ts";
import { buildMatches } from "./matches.ts";
import { mergeMeta, resolveLinks, resolveMeta } from "./meta.ts";
import {
  collectRouteMiddleware,
  createMiddlewareContext,
  type MiddlewareContext,
  runRouteMiddleware,
} from "./middleware.ts";
import { renderRootErrorDocument, renderRoute, type ServerManifest } from "./render.ts";
import { getRequestId, setRoutePattern } from "./request-context.ts";
import { routePatternOf } from "./scanner.ts";
import {
  error,
  isSafeInternalRedirect,
  json,
  redirect,
  redirectEnvelope,
  sanitizeRedirect,
} from "./response.ts";
import { PRERENDER_HEADER, REVALIDATE_HEADER } from "./isr.ts";
import { validateSearch } from "./search.ts";

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
  /** See `BractJSConfig.streamTimeout`. */
  streamTimeout?: number;
  /** See `BractJSConfig.i18n`: locale prefixes are stripped before matching. */
  i18n?: I18nConfig;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// SECURITY(medium): cap form/multipart bodies for route mutations so a
// single client cannot exhaust memory. Multipart uploads of legitimate
// large files should use a dedicated upload endpoint configured separately.
const MAX_FORM_BYTES = 10 * 1_048_576; // 10 MiB

type RouteChain = Awaited<ReturnType<typeof resolveRouteChain>>;
type PipelineLoaderArgs = ReturnType<typeof buildLoaderArgs>;

/**
 * SECURITY(high): the shared route-gate pipeline — nested middleware
 * (root → layout → route, shared mutable `context`, may short-circuit) →
 * per-route context factory → loader args → beforeLoad gate. BOTH the
 * document branch and the /_data soft-nav branch run requests through this
 * single function; that equivalence IS the auth contract (a gate that held
 * for the document but not for /_data would leak loader data to soft
 * navigations, and vice versa). `data-contract.test.ts` pins the parity.
 *
 * What happens *after* the gates — actions, selective-SSR loader stripping,
 * HTML render vs. JSON payload — intentionally differs per branch and lives
 * in the `work` continuation.
 */
async function runRoutePipeline(
  request: Request,
  params: Record<string, string>,
  chain: RouteChain,
  search: Record<string, unknown>,
  context: Record<string, unknown>,
  work: (args: PipelineLoaderArgs, mwCtx: MiddlewareContext) => Promise<Response>,
): Promise<Response> {
  const mwCtx: MiddlewareContext = createMiddlewareContext(request, params, context);
  const res = await runRouteMiddleware(collectRouteMiddleware(chain), mwCtx, async () => {
    const routeContext = await runRouteContext(
      chain.route as Parameters<typeof runRouteContext>[0],
      request,
      params,
      mwCtx.context,
    );
    const args = buildLoaderArgs(request, params, routeContext, search);
    const beforeLoadResponse = await runBeforeLoad(chain.route, args);
    if (beforeLoadResponse) return beforeLoadResponse;
    return work(args, mwCtx);
  });
  // SECURITY(medium): the open-redirect backstop covers the WHOLE gate pipeline,
  // not just loaders/actions. Route middleware and beforeLoad may *return* a
  // redirect Response too — a raw off-origin `Location` built from user input in
  // those hooks would otherwise be emitted unchecked. sanitizeRedirect is a
  // no-op for non-3xx, same-origin, and `allowExternal`-branded responses, so it
  // is idempotent over the loader/action redirects `work` already sanitized.
  // Scoped to the SSR route handler on purpose: /api handlers and the global
  // pipeline (e.g. an OAuth start route that redirects off-origin) are not gated.
  return envelopeActionRedirect(sanitizeRedirect(res, request.url), request);
}

/**
 * For client-side action submits (fetches carrying `X-BractJS-Action`),
 * convert a redirect into `204 No Content` + `X-BractJS-Redirect: <location>`.
 * fetch() follows redirects opaquely, so a raw 3xx makes the browser burn a
 * full document GET it then discards — consuming one-shot state on the way
 * (e.g. a flash cookie the target layout reads-and-clears in `headers()`),
 * which is why post-redirect toasts historically never fired. The envelope
 * lets the router soft-navigate instead, so the `/_data` request is the FIRST
 * to present the cookie. Runs after sanitizeRedirect, so the Location is
 * already vetted; all other headers (Set-Cookie!) are preserved. Browser form
 * posts (no header) keep the plain 3xx.
 */
function envelopeActionRedirect(res: Response, request: Request): Response {
  if (!MUTATING_METHODS.has(request.method)) return res;
  if (request.headers.get("X-BractJS-Action") !== "1") return res;
  return redirectEnvelope(res);
}

/**
 * The chain minus `meta`/`headers` of the module whose loader failed and of
 * every module below it: they expect loader data and would receive the
 * `{ __error }` slot (or never render at all). Modules above the failure still
 * apply to the error page.
 */
function withoutFailedHead<
  C extends {
    layouts: ReadonlyArray<{ meta?: unknown; headers?: unknown }>;
    route: { meta?: unknown; headers?: unknown };
  },
>(chain: C, failure: LoaderFailure | null): C {
  if (!failure || failure.scope === "root") return chain;
  const from = failure.scope === "layout" ? failure.index : chain.layouts.length;
  return {
    ...chain,
    layouts: chain.layouts.map((mod, i) =>
      i < from ? mod : { ...mod, meta: undefined, headers: undefined },
    ),
    route: { ...chain.route, meta: undefined, headers: undefined },
  };
}

function hasLocaleCookie(request: Request): boolean {
  return (request.headers.get("Cookie") ?? "")
    .split(";")
    .some((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
}

/** Set the remembered-locale cookie on a response (copying it if its headers are immutable). */
function withLocaleCookie(res: Response, locale: string): Response {
  const cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    res.headers.append("Set-Cookie", cookie);
    return res;
  } catch {
    const copy = new Response(res.body, res);
    copy.headers.append("Set-Cookie", cookie);
    return copy;
  }
}

/** A browser navigation asking for an HTML page (vs. an asset or a data fetch). */
function isDocumentRequest(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

/** Wrap the root element in root.tsx's `Layout` export, when it has one. */
function withRootLayout(
  Layout: React.ComponentType<{ children?: React.ReactNode }> | undefined,
  rootElement: React.ReactElement,
): React.ReactElement {
  return Layout ? createElement(Layout, null, rootElement) : rootElement;
}

/** `request` with `formData()` answering from an already-parsed body (callable repeatedly). */
function withParsedFormData(request: Request, formData: FormData): Request {
  const proxy = new Proxy(request, {
    get(target, prop) {
      if (prop === "formData") return () => Promise.resolve(formData);
      // Receiver = target: Request's native getters (url, headers, …) need the real object.
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  // The proxy is a different object: keep getClientAddress(request) working in actions.
  inheritClientAddress(request, proxy);
  return proxy;
}

export async function handleRequest(
  request: Request,
  trie: TrieNode,
  config: HandlerConfig,
  context: Record<string, unknown> = {},
): Promise<Response> {
  // The global pipeline is run once by buildFetchHandler around the whole
  // dispatch (so it also covers /api, /_action, /_stream, /_image, static).
  // We receive the shared, already-running `context` here and only run the
  // per-route (nested) middleware chain — running the global pipeline again
  // would double-invoke cors()/csp()/etc. for SSR documents.
  return route(request, trie, config, context);
}

async function route(
  request: Request,
  trie: TrieNode,
  config: HandlerConfig,
  context: Record<string, unknown>,
): Promise<Response> {
  const { appDir, manifest, onError, moduleRegistry, streamTimeout, i18n } = config;
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
    // i18n: match the path without its locale prefix; loaders see the locale
    // on context.locale.
    const dataLocale = i18n ? splitLocale(targetPathname, i18n) : null;
    if (dataLocale) context.locale = dataLocale.locale;
    const match = matchRoute(dataLocale?.pathname ?? targetPathname, trie);
    setRoutePattern(match?.routeFile ? routePatternOf(match.routeFile.segments) : undefined);
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
      // Soft navigations: loaders/gates see the client address a document load would.
      inheritClientAddress(request, loaderRequest);
      // Validate search params before any route work runs — loaders must
      // never see unvalidated input, and a 400 here is cheaper than a wasted
      // context-factory/loader run. The thrown 400 Response propagates below.
      const search = await validateSearch(chain.route.searchSchema, targetUrl);

      // SECURITY(high): /_data must run the same auth/redirect gates as a full
      // page request — otherwise a SPA-style soft navigation to a protected
      // route would bypass nested middleware / beforeLoad() / defineContext()
      // and leak loader data. runRoutePipeline is the single shared gate
      // sequence for both branches.
      // `return await` (not bare `return`): a loader/gate inside the middleware
      // work can throw a redirect (e.g. requireAdmin). Without awaiting here the
      // returned promise rejects *after* this try block, so the catch below never
      // runs isRedirect() and the redirect escapes to the top-level handler as a
      // 500 instead of being returned as a 302 for the soft-nav client.
      // Envelope here, not in runRoutePipeline: it sees `loaderRequest` (the
      // target URL), and a redirect *returned* by middleware/beforeLoad comes
      // back as its Response rather than through the catch below.
      return redirectEnvelope(
        await runRoutePipeline(loaderRequest, match.params, chain, search, context, async (args) => {
          const results = await runLoaders(chain, args, onError);
          // A failed root loader leaves nothing to render client-side: answer with
          // its status, and the router falls back to a document load, which
          // renders the root error document. Layout and route failures ride along
          // in their slots — <Outlet> renders the nearest ErrorBoundary.
          const failure = firstLoaderFailure(results);
          if (failure?.scope === "root") {
            return json({ error: failure.error.message }, { status: routeErrorStatus(failure.error) });
          }
          // Merged meta must ride along: ClientRouter re-renders the document head
          // from this payload on soft navigation, and the initial __BRACTJS_DATA__
          // already carries the merged shape.
          const headChain = withoutFailedHead(chain, failure);
          const meta = mergeMeta(
            resolveMeta(headChain, results, match.params, {
              pathname: targetPathname,
              search: targetUrl.search,
              error: failure?.error,
            }),
          );
          const links = resolveLinks(chain);
          const matches = buildMatches(chain, results, match.params, targetPathname);
          // defer() fields are awaited and inlined: JSON can't stream them, and a
          // Deferred would otherwise serialize as an empty object.
          const dataRes = json(
            await settleDeferred(
              {
                root: results.root,
                layouts: results.layouts,
                route: results.route,
                params: match.params,
                meta,
                links,
                search,
                matches,
                requestId: getRequestId(),
                locale: dataLocale?.locale,
              },
              streamTimeout,
            ),
          );
          // Apply the route `headers()` chain so a soft navigation gets the same
          // Cache-Control/ETag/Vary as the full document load (renderRoute applies
          // them there). Content-Type stays application/json.
          const dataHeaders = resolveHeaders(headChain, results, match.params, loaderRequest);
          if (dataHeaders) {
            dataHeaders.forEach((value, key) => {
              const k = key.toLowerCase();
              if (k === "content-type") return;
              // Several Set-Cookie values must all survive (set() keeps only the last).
              if (k === "set-cookie") dataRes.headers.append(key, value);
              else dataRes.headers.set(key, value);
            });
          }
          return dataRes;
        }),
      );
    } catch (err) {
      if (isRedirect(err)) return redirectEnvelope(sanitizeRedirect(err as Response, request.url));
      // A non-redirect Response (e.g. the 400 thrown by search validation)
      // is the intended reply — pass it through verbatim.
      if (err instanceof Response) return err;
      if (isHttpError(err)) return json({ error: err.message }, { status: err.status });
      console.error("[bractjs] /_data error:", err);
      await fireOnError(onError, err, request);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // ── Locale ────────────────────────────────────────────────────────────
  // i18n: `/fr/about` renders routes/about.tsx with context.locale = "fr";
  // `/about` is the default locale. Matching sees the path without its prefix.
  let matchPathname = pathname;
  let locale: string | undefined;
  if (i18n) {
    const found = splitLocale(pathname, i18n);
    const isRead = request.method === "GET" || request.method === "HEAD";
    // One canonical URL per page: /en/about (the default locale) → /about.
    // Not for "/en//host": redirect() would refuse that Location and throw, so
    // let it fall through to matching (and 404) instead of a 500.
    if (found.prefix === i18n.defaultLocale && isRead && isSafeInternalRedirect(found.pathname)) {
      return redirect(found.pathname + url.search, 308);
    }
    // First visit to an unprefixed page: send the visitor to the locale their
    // browser prefers. The cookie (set on every page below) makes it once-only.
    if (i18n.detect && !found.prefix && isDocumentRequest(request) && !hasLocaleCookie(request)) {
      const preferred = negotiateLocale(request.headers.get("Accept-Language"), i18n);
      if (preferred && preferred !== i18n.defaultLocale) {
        return withLocaleCookie(
          redirect(localizePath(pathname, preferred, i18n) + url.search, 302),
          preferred,
        );
      }
    }
    locale = found.locale;
    matchPathname = found.pathname;
    context.locale = locale;
  }

  // ── Route matching ────────────────────────────────────────────────────
  // A browser asking for a page no route matches gets the app's own 404:
  // root renders (its middleware and loader run) with a 404 in the route
  // slot, so root's ErrorBoundary shows inside the app's chrome. Anything
  // else (assets, fetches, crawlers asking for JSON) gets a plain 404.
  const matched = matchRoute(matchPathname, trie);
  if (!matched && !isDocumentRequest(request)) return error("Not Found", 404);
  // Pages answer GET/HEAD and the mutating methods only: an OPTIONS/PROPFIND
  // must not run middleware and every loader and get a 200 document back.
  if (request.method !== "GET" && request.method !== "HEAD" && !MUTATING_METHODS.has(request.method)) {
    return error("Method Not Allowed", 405);
  }
  const match = matched ?? { routeFile: undefined, params: {} as Record<string, string> };
  setRoutePattern(match.routeFile ? routePatternOf(match.routeFile.segments) : undefined);

  const chain = match.routeFile
    ? await resolveRouteChain(match.routeFile, appDir, moduleRegistry)
    : await resolveRootChain(appDir, moduleRegistry);

  // Validate search params before any route work (context factory, beforeLoad,
  // action, loaders) — they all receive the validated object.
  let search: Record<string, unknown>;
  try {
    search = await validateSearch(chain.route.searchSchema, url);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  // SECURITY(medium): the CSRF gate runs before route middleware, the context
  // factory and beforeLoad — a cross-site POST must not execute any of their
  // side effects (or be answered by a beforeLoad redirect instead of the 403).
  // /_action and /api already check first; this keeps route mutations in step.
  if (MUTATING_METHODS.has(request.method) && !isAllowedMutation(request)) return csrfForbiddenResponse();

  // Middleware → context → args → beforeLoad run in runRoutePipeline (the
  // shared gate sequence with the /_data branch); everything below is the
  // document-specific work: actions, selective SSR, and the HTML render.
  let response: Response;
  try {
    response = await runRoutePipeline(request, match.params, chain, search, context, async (args, mwCtx) => {
      // ── Action (mutating methods) ─────────────────────────────────────────
      let actionData: unknown = null;
      // data(value, init) from the action: status/headers for the response.
      let actionInit: ResponseInit | null = null;
      if (MUTATING_METHODS.has(request.method)) {
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
          const isFormLike =
            ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
          const formData = isFormLike ? await request.formData() : new FormData();
          // The body is consumed above, so the Remix/React Router habit of
          // `await request.formData()` inside the action would throw "Body
          // already used" — hand the action a request that returns the parsed copy.
          const actionRequest = isFormLike ? withParsedFormData(args.request, formData) : args.request;
          actionData = await runAction(
            chain.route,
            { ...args, request: actionRequest, formData },
            chain.files?.route ?? match.routeFile?.filePath,
          );
        } catch (err) {
          if (isRedirect(err)) return sanitizeRedirect(err as Response, request.url);
          if (isHttpError(err)) return error(err.message, err.status);
          // Name the failing route so the log points at the right file.
          console.error(`[bractjs] action error in ${chain.files?.route ?? match.routeFile?.filePath}:`, err);
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
        ({ value: actionData, init: actionInit } = unwrapData(actionData));

        // Client-side Form submits with this header — return JSON, not HTML.
        if (request.headers.get("X-BractJS-Action")) {
          const res = json(
            actionData ?? null,
            actionInit?.status ? { status: actionInit.status } : undefined,
          );
          new Headers(actionInit?.headers).forEach((value, key) => {
            if (key.toLowerCase() !== "content-type") res.headers.append(key, value);
          });
          return res;
        }
      }

      // ── Selective SSR ─────────────────────────────────────────────────────
      // `ssr: false` skips the ROUTE loader during document SSR (root/layout
      // loaders still run — they render the shell). beforeLoad already ran above:
      // it is the auth gate and must hold for every mode. The client completes
      // the render via /_data after hydration, where the loader DOES run.
      // React Router: a HydrateFallback + `clientLoader.hydrate = true` SSRs the
      // fallback and lets the client loader finish the render — "data-only".
      const routeSsr =
        chain.route.ssr ??
        (chain.route.clientLoaderHydrate && chain.route.HydrateFallback ? ("data-only" as const) : true);
      const loaderChain =
        routeSsr === false ? { ...chain, route: { ...chain.route, loader: undefined } } : chain;

      // ── Loaders ───────────────────────────────────────────────────────────
      let loaderResults;
      try {
        loaderResults = await runLoaders(loaderChain, args, onError);
        if (!match.routeFile) loaderResults.route = { __error: { message: "Not Found", status: 404 } };
      } catch (err) {
        // Loader HttpErrors are captured into their slots (see below); only
        // redirects and framework failures land here.
        if (isRedirect(err)) return sanitizeRedirect(err as Response, request.url);
        await fireOnError(onError, err, request);
        if (isExplicitDev()) return error(err instanceof Error ? err.message : String(err), 500);
        return error("Internal Server Error", 500);
      }

      const failure = firstLoaderFailure(loaderResults);
      // root.tsx owns <html>, so a failed root loader leaves no app shell to put
      // a boundary in: render root's ErrorBoundary in a minimal document instead.
      if (failure?.scope === "root") {
        return renderRootErrorDocument({
          Boundary: pickBoundaryForFailure(undefined, [], 0, chain.root.ErrorBoundary),
          Layout: chain.root.Layout,
          error: failure.error,
          params: match.params,
          pathname,
          search: url.search,
          manifest,
          nonce: getCspNonce(mwCtx.context),
          status: routeErrorStatus(failure.error),
          locale,
          i18n,
        });
      }

      const loaderData = {
        root: loaderResults.root,
        layouts: loaderResults.layouts,
        route: loaderResults.route,
      };

      // ── SSR render ────────────────────────────────────────────────────────
      const RootComponent = chain.root.default ?? (() => null);
      // A failed route loader renders the nearest ErrorBoundary in the route's
      // place, with the error's status (404 for HttpError(404), else 500). A
      // failed layout loader is rendered by <Outlet> at that layout's level.
      const routeError = routeSsr === true && failure?.scope === "route" ? failure.error : null;
      const Boundary = routeError
        ? pickBoundaryForFailure(
            chain.route.ErrorBoundary,
            chain.layouts,
            chain.layouts.length,
            chain.root.ErrorBoundary,
          )
        : null;
      const layoutError = failure?.scope === "layout" ? failure.error : null;
      // The failure that sets the document status: one whose boundary renders
      // (a selective-SSR route's loader error surfaces after hydration instead).
      const statusFailure = routeError || layoutError ? failure : null;
      // Non-default SSR modes render the Fallback (or nothing) in the component's
      // place; the client swaps in the real component after hydration.
      const RouteComponent =
        Boundary && routeError
          ? () => renderErrorBoundary(Boundary, routeError, { params: match.params })
          : routeSsr === true
            ? chain.route.default
            : (chain.route.Fallback ?? chain.route.HydrateFallback);
      const ssrMode =
        routeSsr === true
          ? undefined
          : routeSsr === false
            ? ("client-only" as const)
            : ("data-only" as const);

      // useMatches() payload — the chain's handle + data, for breadcrumbs etc.
      // Built from loaderChain so the loader slices line up with what ran.
      const matches = buildMatches(loaderChain, loaderResults, match.params, pathname);

      // Wrap root in BractJSProvider so <Outlet> can render the route component
      // server-side without needing a ClientRouter.
      // eslint-disable-next-line react/no-children-prop -- children passed via createElement props object is the intended SSR shell shape
      const shell = createElement(BractJSProvider, {
        value: {
          loaderData: loaderData as Record<string, unknown>,
          actionData,
          params: match.params,
          pathname,
          manifest: manifest as unknown as import("../shared/context.ts").RouteManifest,
          RouteComponent,
          LayoutModules: chain.layouts,
          RootErrorBoundary: chain.root.ErrorBoundary,
          locale,
          i18n,
          location: { pathname, search: url.search, hash: "", state: null, key: "default" },
          search,
          matches,
        },
        // Root receives React Router-style component props too (its own slice),
        // inside root's `Layout` (the document shell) when it exports one.
        children: withRootLayout(
          chain.root.Layout,
          createElement(RootComponent as React.ComponentType<Record<string, unknown>>, {
            loaderData: loaderResults.root,
            actionData: actionData ?? undefined,
            params: match.params,
            matches,
          }),
        ),
      });

      const meta = resolveMeta(withoutFailedHead(chain, failure), loaderResults, match.params, {
        pathname,
        search: url.search,
        error: failure?.error,
      });
      // Route `headers()` chain (Cache-Control/ETag/Vary/…), applied on top of the
      // baseline document headers in renderRoute. Uses the loaders that actually
      // ran (loaderChain) so a selective-SSR route's headers() sees the same data.
      const routeHeaders = resolveHeaders(
        withoutFailedHead(loaderChain, failure),
        loaderResults,
        match.params,
        request,
        actionInit,
      );
      // Without a headers() export, a data(…, { headers }) from the action still
      // applies to the re-rendered document (e.g. Set-Cookie on a no-JS post).
      const documentHeaders = routeHeaders ?? (actionInit?.headers ? new Headers(actionInit.headers) : null);
      // Status: a layout- or route-loader error wins; else a data(…, { status })
      // from the leaf loader, then the action (React Router parity).
      const dataStatus = loaderResults.inits?.route?.status ?? actionInit?.status;

      // Root, its Layout and layout components render outside every error
      // boundary, so a throw there rejects the stream before any HTML exists.
      // Answer with the root error document (an HTML 500 that hydrates), not
      // the catch-all JSON error. Route components are inside a boundary
      // (<Outlet>) and never reach this.
      const renderShellFailure = async (err: unknown): Promise<Response> => {
        console.error(`[bractjs] render error in ${chain.files?.route ?? match.routeFile?.filePath}:`, err);
        await fireOnError(onError, err, request);
        // The message is serialized into the page: only dev sees the real one.
        const shown = isExplicitDev()
          ? err instanceof Error
            ? err
            : new Error(String(err))
          : new Error("Internal Server Error");
        return renderRootErrorDocument({
          Boundary: pickBoundaryForFailure(undefined, [], 0, chain.root.ErrorBoundary),
          Layout: chain.root.Layout,
          error: shown,
          params: match.params,
          pathname,
          search: url.search,
          manifest,
          nonce: getCspNonce(mwCtx.context),
          status: 500,
          locale,
          i18n,
        });
      };

      let document: Response;
      try {
        document = await renderRoute({
          shell,
          loaderData,
          actionData,
          params: match.params,
          pathname,
          search,
          manifest,
          meta,
          links: resolveLinks(chain),
          matches,
          headers: documentHeaders,
          routeFile: match.routeFile?.filePath,
          // Manifest key for this route — selects its extracted CSS bundles.
          routePattern: match.routeFile?.urlPattern,
          // Set by the opt-in csp() middleware; undefined otherwise.
          nonce: getCspNonce(mwCtx.context),
          ssrMode,
          streamTimeout,
          locale,
          i18n,
          status: statusFailure ? routeErrorStatus(statusFailure.error) : dataStatus,
        });
      } catch (err) {
        // React rejects with the thrown value itself: a component's
        // `throw redirect()` / HttpError / Response is still the intended answer
        // — the outer catch turns it into a 3xx (or envelope), an error
        // document with its status, or the Response verbatim.
        if (err instanceof Response || isHttpError(err)) throw err;
        return renderShellFailure(err);
      }
      // Prerendering asks which pages are ISR pages (route `config.revalidate`).
      const revalidate = chain.route.config?.revalidate;
      if (request.headers.has(PRERENDER_HEADER) && typeof revalidate === "number") {
        document.headers.set(REVALIDATE_HEADER, String(revalidate));
      }
      return document;
    });
  } catch (err) {
    // Parity with the /_data and /_action branches: a gate (route middleware,
    // the context factory, beforeLoad) that *throws* `redirect()` or an
    // HttpError must answer with that redirect / status on a full document
    // load too — not fall through to the catch-all 500. Any other Response is
    // the intended reply; everything else is a real failure for the outer handler.
    if (isRedirect(err))
      return envelopeActionRedirect(sanitizeRedirect(err as Response, request.url), request);
    if (err instanceof Response) return err;
    if (isHttpError(err)) {
      return renderRootErrorDocument({
        Boundary: pickBoundaryForFailure(undefined, [], 0, chain.root.ErrorBoundary),
        Layout: chain.root.Layout,
        error: err,
        params: match.params,
        pathname,
        search: url.search,
        manifest,
        nonce: getCspNonce(context),
        status: err.status,
        locale,
        i18n,
      });
    }
    throw err;
  }
  // With detect, remember the locale this page is in — a visitor who follows
  // a link to another locale keeps it instead of being redirected back.
  return i18n?.detect && locale && isDocumentRequest(request) ? withLocaleCookie(response, locale) : response;
}
