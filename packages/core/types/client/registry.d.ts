/**
 * Augmentable registration interface. Empty by default; `route-types.gen.ts`
 * augments it with this app's `RouteRegistry`. See file header.
 */
export interface Register {
}
/** The shape the generated file plugs into `Register["routes"]`. */
export interface RouteRegistry {
    /** Union of all route patterns, colon-style — e.g. `"/" | "/blog/:id"`. */
    routes: string;
    /** Map of pattern → params object — e.g. `{ "/blog/:id": { id: string } }`. */
    params: Record<string, Record<string, string>>;
    /** Map of pattern → search-params object. */
    search: Record<string, Record<string, string>>;
}
/** Per-route search-params shapes. Augment to type a route's search params. */
export interface RouteSearchParamsMap {
}
/** Per-route context shapes. Augment to type a route's `context`. */
export interface RouteContextMap {
}
/**
 * The app's route union when registered, else `string`. The fallback is what
 * keeps un-codegen'd apps compiling: every `to` still accepts any string.
 */
export type RegisteredRoutes = Register extends {
    routes: {
        routes: infer R;
    };
} ? R : string;
/** Pattern → params map when registered, else a permissive map. */
export type RegisteredParamsMap = Register extends {
    routes: {
        params: infer P;
    };
} ? P : Record<string, Record<string, string>>;
/** Pattern → search map when registered, else a permissive map. */
export type RegisteredSearchMap = Register extends {
    routes: {
        search: infer S;
    };
} ? S : Record<string, Record<string, string>>;
/**
 * Pattern → VALIDATED search shape (the output of each route's `searchSchema`),
 * registered by codegen under `Register.routes.searchOutput`. Distinct from
 * `RegisteredSearchMap`, which stays string-valued for the legacy
 * `useSearchParams` surface.
 */
export type RegisteredSearchOutputMap = Register extends {
    routes: {
        searchOutput: infer S;
    };
} ? S : Record<string, Record<string, unknown>>;
/** Params object for a specific route literal (`{}` for static routes). */
export type ParamsFor<TTo> = TTo extends keyof RegisteredParamsMap ? RegisteredParamsMap[TTo] : Record<string, string>;
/** Search-params object for a specific route literal. */
export type SearchFor<TTo> = TTo extends keyof RegisteredSearchMap ? RegisteredSearchMap[TTo] : Record<string, string>;
/** Validated (schema-output) search object for a specific route literal. */
export type SearchOutputFor<TTo> = TTo extends keyof RegisteredSearchOutputMap ? RegisteredSearchOutputMap[TTo] : Record<string, unknown>;
/**
 * Infer the output type of a Zod/Valibot-compatible schema — the duck-typed
 * counterpart of `z.infer`. Used by the generated route types to derive each
 * route's search shape from its `searchSchema` export.
 */
export type InferSchemaOutput<S> = S extends {
    parse(input: unknown): infer T;
} ? T : S extends {
    safeParse(input: unknown): infer R;
} ? Awaited<R> extends {
    data?: infer T;
} ? NonNullable<T> : Record<string, unknown> : Record<string, unknown>;
/** Whether a route literal carries any path params. Reserved for a future strict `<Link>` mode. */
export type HasParams<TTo> = keyof ParamsFor<TTo> extends never ? false : true;
