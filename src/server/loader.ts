import type { LoaderArgs, ActionArgs, RouteModule } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import { isRedirect, isHttpError } from "../shared/errors.ts";

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
  args: LoaderArgs
): Promise<T | { __error: unknown } | null> {
  if (!fn) return null;

  try {
    return await fn(args);
  } catch (err) {
    // Re-throw redirects and HTTP errors — caller handles them
    if (isRedirect(err) || isHttpError(err)) throw err;
    return { __error: err };
  }
}

// ── runLoaders ─────────────────────────────────────────────────────────────

export async function runLoaders(
  chain: LayoutChain,
  args: LoaderArgs
): Promise<LoaderResults> {
  const layoutLoaders = chain.layouts.map((mod) =>
    safeRun(mod.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined, args)
  );

  const [root, ...layoutResults] = await Promise.all([
    safeRun(chain.root.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined, args),
    ...layoutLoaders,
  ]);

  const route = await safeRun(
    chain.route.loader as ((a: LoaderArgs) => Promise<unknown>) | undefined,
    args
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
