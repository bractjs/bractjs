// Browser-side route data: `clientMiddleware` and `clientLoader` for every
// module in the matched chain (root → layouts → route), shared by the router
// (navigation, revalidation, submissions) and fetchers.
import type { ClientMiddlewareFunction } from "../shared/route-types.ts";
import { RouterContextProvider } from "../shared/router-context.ts";
import type { RouteModuleClient } from "./router.tsx";

/** The client modules for one URL, outermost first. */
export interface ClientChain {
  root: RouteModuleClient | null;
  layouts: Array<RouteModuleClient | null>;
  route: RouteModuleClient | null;
}

export interface ClientDataArgs {
  request: Request;
  params: Record<string, string>;
  /** One per navigation/submission/fetch, shared by its middleware and client loaders/actions. */
  context: RouterContextProvider;
}

/** A fresh context for one navigation, submission or fetch. */
export function createClientContext(): RouterContextProvider {
  return new RouterContextProvider();
}

function modules(chain: ClientChain): Array<RouteModuleClient | null> {
  return [chain.root, ...chain.layouts, chain.route];
}

/**
 * Run the chain's `clientMiddleware` (root → layouts → route, each module's
 * array in order) around `work`. Like server middleware: call `next()` to
 * continue (it resolves to `work`'s result); returning without calling it
 * continues the chain anyway; throwing (e.g. `throw redirect("/login")`)
 * aborts the work and propagates to the caller.
 */
export async function runClientMiddleware<T>(
  chain: ClientChain,
  args: ClientDataArgs,
  work: () => Promise<T>,
): Promise<T> {
  const fns: ClientMiddlewareFunction[] = [];
  for (const mod of modules(chain)) {
    // `unstable_clientMiddleware`: the React Router 7.x name.
    const mw =
      mod?.clientMiddleware ??
      (mod as { unstable_clientMiddleware?: ClientMiddlewareFunction[] } | null)?.unstable_clientMiddleware;
    if (Array.isArray(mw)) fns.push(...mw);
    else if (typeof mw === "function") fns.push(mw);
  }
  const dispatch = async (i: number): Promise<T> => {
    const fn = fns[i];
    if (!fn) return work();
    let called = false;
    let result: Promise<T> | undefined;
    const next = () => {
      if (called) throw new Error("[bractjs] clientMiddleware called next() more than once");
      called = true;
      result = dispatch(i + 1);
      return result;
    };
    await fn(args, next);
    return called ? (result as Promise<T>) : dispatch(i + 1);
  };
  return dispatch(0);
}

/**
 * Run each module's `clientLoader` over its own slice of a `/_data` payload
 * (root → `data.root`, layout i → `data.layouts[i]`, route → `data.route`),
 * in parallel. Each gets `serverLoader()` resolving to its server slice.
 * A failing clientLoader is logged and leaves the server slice in place.
 */
export async function applyClientLoaders(
  chain: ClientChain,
  data: Record<string, unknown>,
  args: ClientDataArgs & { search: Record<string, unknown> },
): Promise<void> {
  const run = async (mod: RouteModuleClient | null, serverSlice: unknown): Promise<unknown> => {
    const clientLoader = mod?.clientLoader;
    if (typeof clientLoader !== "function") return serverSlice;
    try {
      return await clientLoader({ ...args, serverLoader: () => Promise.resolve(serverSlice) });
    } catch (err) {
      console.error("[bractjs] clientLoader error:", err);
      return serverSlice;
    }
  };
  const layouts = (data.layouts as unknown[] | undefined) ?? [];
  const [root, route, ...layoutSlices] = await Promise.all([
    run(chain.root, data.root),
    run(chain.route, data.route),
    ...chain.layouts.map((mod, i) => run(mod, layouts[i])),
  ]);
  data.root = root;
  data.route = route;
  if (chain.layouts.length > 0)
    data.layouts = layouts.map((slice, i) => (i < layoutSlices.length ? layoutSlices[i] : slice));
}

// ── Bridge for fetchers ─────────────────────────────────────────────────────
// Fetchers are plain functions (no router access); the mounted ClientRouter
// registers how to resolve a URL's client modules.

type ChainResolver = (path: string) => Promise<{ chain: ClientChain; params: Record<string, string> }>;
let resolver: ChainResolver | null = null;

/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export function registerClientChainResolver(fn: ChainResolver | null): void {
  resolver = fn;
}

/** The client modules for a URL, or an empty chain when no router is mounted. */
export function resolveClientChain(
  path: string,
): Promise<{ chain: ClientChain; params: Record<string, string> }> {
  if (resolver) return resolver(path);
  return Promise.resolve({ chain: { root: null, layouts: [], route: null }, params: {} });
}
