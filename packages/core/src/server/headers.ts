import type { HeadersFunction } from "../shared/route-types.ts";
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
export function resolveHeaders(
  chain: LayoutChain,
  loaderData: LoaderResults,
  params: Params,
  request: Request,
  actionInit?: ResponseInit | null,
): Headers | null {
  const inits = loaderData.inits;
  const links: Array<{ fn: HeadersFunction; data: unknown; init: ResponseInit | null | undefined }> = [];

  if (chain.root.headers) links.push({ fn: chain.root.headers, data: loaderData.root, init: inits?.root });
  chain.layouts.forEach((mod, i) => {
    if (mod.headers)
      links.push({ fn: mod.headers, data: loaderData.layouts[i] ?? null, init: inits?.layouts[i] });
  });
  if (chain.route.headers)
    links.push({ fn: chain.route.headers, data: loaderData.route, init: inits?.route });

  if (links.length === 0) return null;

  const actionHeaders = new Headers(actionInit?.headers);
  const merged = new Headers();
  for (const { fn, data, init } of links) {
    const produced = new Headers(
      fn({
        loaderData: data,
        params,
        request,
        parentHeaders: merged,
        // React Router: headers a loader/action attached with data(value, { headers }).
        loaderHeaders: new Headers(init?.headers),
        actionHeaders,
        errorHeaders: undefined,
      }),
    );
    // `set` (not `append`) so an inner route overrides an ancestor's value for
    // the same key rather than accumulating duplicates.
    produced.forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

/**
 * Copy resolved route headers onto a base headers object, overriding any
 * same-key defaults. Mutates and returns `base`. No-op when `resolved` is null.
 */
export function applyRouteHeaders(base: Headers, resolved: Headers | null): Headers {
  if (resolved) resolved.forEach((value, key) => base.set(key, value));
  return base;
}
