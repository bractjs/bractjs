import { isDataWithResponseInit, toHttpError } from "../shared/data.ts";
import { isHttpError, isRedirect } from "../shared/errors.ts";
import type { ActionArgs, LoaderArgs, RouteModule } from "../shared/route-types.ts";
import { type RouteContext, withContextAccessors } from "../shared/router-context.ts";
import type { ContextFactory } from "./context.ts";
import { isExplicitDev } from "./env.ts";
import { instrumentRoute } from "./instrumentation.ts";
import type { LayoutChain } from "./layout.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type LoaderResult = unknown | { __error: unknown } | null;

export interface LoaderResults {
  root: LoaderResult;
  layouts: LoaderResult[];
  route: LoaderResult;
  /**
   * The `ResponseInit` of each slot whose loader returned `data(value, init)`
   * (the slot itself holds the unwrapped value). Absent when no loader did.
   */
  inits?: { root: ResponseInit | null; layouts: Array<ResponseInit | null>; route: ResponseInit | null };
}

/** Split a loader/action return into its value and the `data()` init, if any. */
export function unwrapData(value: unknown): { value: unknown; init: ResponseInit | null } {
  if (isDataWithResponseInit(value)) return { value: value.data, init: value.init };
  return { value, init: null };
}

// ── safeRun ────────────────────────────────────────────────────────────────

export async function safeRun<T>(
  fn: ((args: LoaderArgs) => Promise<T> | T) | undefined,
  args: LoaderArgs,
  onError?: OnErrorHook,
  where?: string,
): Promise<T | { __error: unknown } | null> {
  if (!fn) return null;

  try {
    return await instrumentRoute(
      "loader",
      { request: args.request, params: args.params, context: args.context, id: where ?? "route" },
      async () => fn(args),
    );
  } catch (err) {
    // Re-throw redirects and HTTP errors — caller handles them. React Router's
    // `throw new Response(…, { status: 404 })` / `throw data(…, { status })`
    // are HTTP errors too: normalize them so they render the ErrorBoundary.
    if (isRedirect(err) || isHttpError(err)) throw err;
    const httpErr = await toHttpError(err);
    if (httpErr) throw httpErr;
    // SECURITY(high): `__error` is serialized into the SSR HTML via
    // safeStringify and reaches the browser. A custom Error subclass with
    // public fields (db query text, file paths, internal IDs, raw user data)
    // would leak them. In production we expose only a generic message; in
    // dev we surface the real message + stack for DX. Routes wanting to
    // surface structured user-facing errors should throw an HttpError, not
    // a custom Error subclass.
    // Name the failing module so the log/overlay points at the right file.
    console.error(`[bractjs] loader error${where ? ` in ${where}` : ""}:`, err);
    await fireOnError(onError, err, args.request);
    const safe = isExplicitDev()
      ? {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          routeFile: where,
        }
      : { message: "Internal Server Error" };
    return { __error: safe };
  }
}

// ── runBeforeLoad ──────────────────────────────────────────────────────────

/**
 * Run the route module's optional `beforeLoad()` export.
 * Returns a Response if beforeLoad wants to short-circuit (redirect / 403),
 * or null to continue normally.
 */
export async function runBeforeLoad(routeModule: RouteModule, args: LoaderArgs): Promise<Response | null> {
  const fn = routeModule.beforeLoad as
    | ((a: {
        params: Record<string, string>;
        context: RouteContext;
        location: { pathname: string; search: string };
        search?: Record<string, unknown>;
      }) => unknown)
    | undefined;
  if (!fn) return null;
  const url = new URL(args.request.url);
  const result = await fn({
    params: args.params,
    context: args.context,
    location: { pathname: url.pathname, search: url.search },
    search: args.search,
  });
  if (result instanceof Response) return result;
  return null;
}

// ── runLoaders ─────────────────────────────────────────────────────────────

/**
 * A loader's HttpError (e.g. 404 "no such post") is captured into its slot
 * rather than aborting the page, so the nearest ErrorBoundary can render with
 * that status (see shared/route-error.ts). Its message is meant for users, so
 * it's kept as-is. Only redirects still reject — so a redirect from any loader
 * wins over an HttpError from another, whichever settles first.
 */
function captureHttpError(err: unknown): { __error: { message: string; status: number } } {
  if (isHttpError(err)) return { __error: { message: err.message, status: err.status } };
  throw err;
}

export async function runLoaders(
  chain: LayoutChain,
  args: LoaderArgs,
  onError?: OnErrorHook,
): Promise<LoaderResults> {
  // Run every loader in the chain concurrently — root, all layouts, and the
  // route loader. The route loader is usually the slowest and most important
  // one, so it must not be serialized behind the layout wave.
  const files = chain.files;
  const layoutLoaders = chain.layouts.map((mod, i) =>
    safeRun(
      mod.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined,
      args,
      onError,
      files?.layouts[i],
    ).catch(captureHttpError),
  );

  const [root, route, ...layoutResults] = await Promise.all([
    safeRun(
      chain.root.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined,
      args,
      onError,
      files?.root,
    ).catch(captureHttpError),
    safeRun(
      chain.route.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined,
      args,
      onError,
      files?.route,
    ).catch(captureHttpError),
    ...layoutLoaders,
  ]);

  // A loader may RETURN a redirect instead of throwing it (React Router
  // honours both). Treat it exactly like a thrown one — the document and
  // /_data branches already answer a rejected redirect — rather than letting
  // the Response object fall through as slot data. Outermost wins, as a
  // thrown root/layout redirect gates everything beneath it.
  // (A returned 3xx without a Location — a 304 Not Modified — is not one.)
  for (const value of [root, ...layoutResults, route]) {
    if (isRedirect(value) && value.headers.has("Location")) throw value;
  }

  // data(value, init): the slot gets the value; the init rides alongside.
  const r = unwrapData(root);
  const rt = unwrapData(route);
  const ls = layoutResults.map(unwrapData);
  const results: LoaderResults = { root: r.value, layouts: ls.map((l) => l.value), route: rt.value };
  if (r.init || rt.init || ls.some((l) => l.init)) {
    results.inits = { root: r.init, layouts: ls.map((l) => l.init), route: rt.init };
  }
  return results;
}

// ── runAction ──────────────────────────────────────────────────────────────

export async function runAction(routeModule: RouteModule, args: ActionArgs, id = "route"): Promise<unknown> {
  if (!routeModule.action) return null;
  const action = routeModule.action as (a: ActionArgs) => Promise<unknown>;

  try {
    return await instrumentRoute(
      "action",
      { request: args.request, params: args.params, context: args.context, id },
      async () => action(args),
    );
  } catch (err) {
    // Re-throw redirects so the server can issue the 3xx response. A thrown
    // error Response / data(…, { status }) becomes an HttpError (RR parity).
    if (isRedirect(err) || isHttpError(err)) throw err;
    throw (await toHttpError(err)) ?? err;
  }
}

// ── buildLoaderArgs ────────────────────────────────────────────────────────

export function buildLoaderArgs(
  request: Request,
  params: Record<string, string>,
  context: Record<string, unknown>,
  search: Record<string, unknown> = {},
): LoaderArgs {
  return { request, url: new URL(request.url), params, context: withContextAccessors(context), search };
}

// ── runRouteContext ────────────────────────────────────────────────────────

/**
 * If the route module exports a `context` ContextFactory, run its factory and
 * merge the result into a new context object.  Returns the base context as-is
 * if no factory is present.
 */
export async function runRouteContext(
  routeModule: RouteModule & { context?: ContextFactory<unknown> },
  request: Request,
  params: Record<string, string>,
  baseContext: Record<string, unknown>,
): Promise<RouteContext> {
  const factory = routeModule.context;
  if (!factory || typeof factory._factory !== "function") return withContextAccessors(baseContext);
  const extra = await factory._factory({ request, params });
  // A new object, but it shares the typed-key store: values middleware set()
  // on the base stay readable via context.get() in loaders.
  return withContextAccessors({ ...baseContext, ...(extra as Record<string, unknown>) }, baseContext);
}
