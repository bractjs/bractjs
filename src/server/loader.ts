import type { LoaderArgs, ActionArgs, RouteModule } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import { isRedirect, isHttpError } from "../shared/errors.ts";
import { isExplicitDev } from "./env.ts";
import type { ContextFactory } from "./context.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type LoaderResult = unknown | { __error: unknown } | null;

export interface LoaderResults {
  root: LoaderResult;
  layouts: LoaderResult[];
  route: LoaderResult;
}

// ── safeRun ────────────────────────────────────────────────────────────────

export async function safeRun<T>(
  fn: ((args: LoaderArgs) => Promise<T> | T) | undefined,
  args: LoaderArgs,
  onError?: OnErrorHook,
): Promise<T | { __error: unknown } | null> {
  if (!fn) return null;

  try {
    return await fn(args);
  } catch (err) {
    // Re-throw redirects and HTTP errors — caller handles them
    if (isRedirect(err) || isHttpError(err)) throw err;
    // SECURITY(high): `__error` is serialized into the SSR HTML via
    // safeStringify and reaches the browser. A custom Error subclass with
    // public fields (db query text, file paths, internal IDs, raw user data)
    // would leak them. In production we expose only a generic message; in
    // dev we surface the real message + stack for DX. Routes wanting to
    // surface structured user-facing errors should throw an HttpError, not
    // a custom Error subclass.
    console.error("[bractjs] loader error:", err);
    await fireOnError(onError, err, args.request);
    const safe = isExplicitDev()
      ? {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
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
export async function runBeforeLoad(
  routeModule: RouteModule,
  args: LoaderArgs,
): Promise<Response | null> {
  const fn = routeModule.beforeLoad as
    | ((a: { params: Record<string,string>; context: Record<string,unknown>; location: { pathname: string; search: string } }) => unknown)
    | undefined;
  if (!fn) return null;
  const url = new URL(args.request.url);
  const result = await fn({
    params: args.params,
    context: args.context,
    location: { pathname: url.pathname, search: url.search },
  });
  if (result instanceof Response) return result;
  return null;
}

// ── runLoaders ─────────────────────────────────────────────────────────────

export async function runLoaders(
  chain: LayoutChain,
  args: LoaderArgs,
  onError?: OnErrorHook,
): Promise<LoaderResults> {
  const layoutLoaders = chain.layouts.map((mod) =>
    safeRun(mod.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined, args, onError)
  );

  const [root, ...layoutResults] = await Promise.all([
    safeRun(chain.root.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined, args, onError),
    ...layoutLoaders,
  ]);

  const route = await safeRun(
    chain.route.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined,
    args,
    onError,
  );

  return { root, layouts: layoutResults, route };
}

// ── runAction ──────────────────────────────────────────────────────────────

export async function runAction(
  routeModule: RouteModule,
  args: ActionArgs
): Promise<unknown> {
  if (!routeModule.action) return null;

  try {
    return await (routeModule.action as (a: ActionArgs) => Promise<unknown>)(args);
  } catch (err) {
    // Re-throw redirects so the server can issue the 3xx response
    if (isRedirect(err) || isHttpError(err)) throw err;
    throw err;
  }
}

// ── buildLoaderArgs ────────────────────────────────────────────────────────

export function buildLoaderArgs(
  request: Request,
  params: Record<string, string>,
  context: Record<string, unknown>
): LoaderArgs {
  return { request, params, context };
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
): Promise<Record<string, unknown>> {
  const factory = routeModule.context;
  if (!factory || typeof factory._factory !== "function") return baseContext;
  const extra = await factory._factory({ request, params });
  return { ...baseContext, ...(extra as Record<string, unknown>) };
}
