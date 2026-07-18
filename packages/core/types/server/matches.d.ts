import type { RouteMatch } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";
/**
 * Build the `useMatches()` payload: one entry per module in the chain
 * (root → layouts → route), pairing each module's static `handle` export with
 * its loader-data slice. Serialized into the SSR bootstrap and `/_data` so the
 * client can read it without re-importing every module.
 *
 * `handle` must be JSON-serializable to survive the SSR/soft-nav transport —
 * the same constraint loader data already has.
 */
export declare function buildMatches(chain: LayoutChain, loaderData: LoaderResults, params: Record<string, string>, pathname: string): RouteMatch[];
