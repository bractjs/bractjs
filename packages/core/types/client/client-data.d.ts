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
export declare function createClientContext(): RouterContextProvider;
/**
 * Run the chain's `clientMiddleware` (root → layouts → route, each module's
 * array in order) around `work`. Like server middleware: call `next()` to
 * continue (it resolves to `work`'s result); returning without calling it
 * continues the chain anyway; throwing (e.g. `throw redirect("/login")`)
 * aborts the work and propagates to the caller.
 */
export declare function runClientMiddleware<T>(chain: ClientChain, args: ClientDataArgs, work: () => Promise<T>): Promise<T>;
/**
 * `value` when it is a redirect a loader meant to follow — a 3xx Response
 * carrying a `Location` (a returned 304 Not Modified is not one) — else null.
 */
export declare function redirectOf(value: unknown): Response | null;
/**
 * Run each module's `clientLoader` over its own slice of a `/_data` payload
 * (root → `data.root`, layout i → `data.layouts[i]`, route → `data.route`),
 * in parallel. Each gets `serverLoader()` resolving to its server slice.
 * A failing clientLoader is logged and leaves the server slice in place —
 * except a redirect, thrown or returned (React Router honours both), which
 * propagates so the navigation / revalidation / fetcher follows it.
 */
export declare function applyClientLoaders(chain: ClientChain, data: Record<string, unknown>, args: ClientDataArgs & {
    search: Record<string, unknown>;
}): Promise<void>;
type ChainResolver = (path: string) => Promise<{
    chain: ClientChain;
    params: Record<string, string>;
}>;
/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export declare function registerClientChainResolver(fn: ChainResolver | null): void;
/** The client modules for a URL, or an empty chain when no router is mounted. */
export declare function resolveClientChain(path: string): Promise<{
    chain: ClientChain;
    params: Record<string, string>;
}>;
export {};
