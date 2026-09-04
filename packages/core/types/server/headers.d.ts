import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";
type Params = Record<string, string>;
/**
 * Walk the route module chain (root → layouts → route) calling each module's
 * optional `headers()` export, threading the accumulated `Headers` through as
 * `parentHeaders`. Each call's returned `HeadersInit` is merged on top, so the
 * innermost route wins per key (RR7 semantics).
 *
 * Returns `null` when no module in the chain exports `headers` — callers keep
 * their existing default headers untouched in that case.
 */
export declare function resolveHeaders(chain: LayoutChain, loaderData: LoaderResults, params: Params, request: Request): Headers | null;
/**
 * Copy resolved route headers onto a base headers object, overriding any
 * same-key defaults. Mutates and returns `base`. No-op when `resolved` is null.
 */
export declare function applyRouteHeaders(base: Headers, resolved: Headers | null): Headers;
export {};
