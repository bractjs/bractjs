import type { MetaDescriptor } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";
type Params = Record<string, string>;
/**
 * Calls each route module's meta() in layout chain order (root → layouts → route),
 * passing the appropriate loaderData slice + params to each.
 */
export declare function resolveMeta(chain: LayoutChain, loaderData: LoaderResults, params: Params): MetaDescriptor[];
/**
 * Deduplicates descriptors: for same `name` or `property`, last-writer wins.
 * Title: last `{ title }` descriptor wins.
 */
export declare function mergeMeta(descriptors: MetaDescriptor[]): MetaDescriptor[];
/** Returns HTML string of <title> and <meta> tags for SSR head injection. */
export declare function renderMetaTags(descriptors: MetaDescriptor[]): string;
export {};
