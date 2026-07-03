// Type-registration seam for end-to-end typed routing (TanStack-Router style).
//
// This file is RUNTIME-FREE — it contributes only types. The runtime helpers
// (`<Link>`, `useNavigate`, `useParams`, `useSearchParams`) resolve their route
// types from `Register` declared here.
//
// HOW IT WORKS
// ------------
// `Register` is an empty, augmentable interface. Running `bractjs codegen`
// writes `app/route-types.gen.ts`, which augments it:
//
//   declare module "@bractjs/bractjs" {
//     interface Register {
//       routes: {
//         routes: "/" | "/blog/:id";
//         params: { "/blog/:id": { id: string } };
//         search: RouteSearchParamsMap;
//       };
//     }
//   }
//
// Once augmented, `<Link to="...">` autocompletes the app's routes and type-
// checks `params`; `useNavigate`, `useParams`, `useSearchParams` follow suit.
//
// GRACEFUL FALLBACK
// -----------------
// Un-augmented (no codegen, or codegen not yet run), `Register` is `{}`, so the
// `Register extends { routes: ... } ? ... : <loose>` conditionals below resolve
// to the loose `string` / `Record<string, string>` types BractJS used before.
// Existing apps therefore keep compiling unchanged — the typed surface only
// activates after the generated augmentation lands.
//
// NOTE: this seam is mirrored verbatim in `types/index.d.ts` (the published
// declaration surface). Keep the two in sync — a divergence silently disables
// typed routing for either monorepo or published consumers.

// ── The augmentable seam ─────────────────────────────────────────────────────

/**
 * Augmentable registration interface. Empty by default; `route-types.gen.ts`
 * augments it with this app's `RouteRegistry`. See file header.
 */
export interface Register {}

/** The shape the generated file plugs into `Register["routes"]`. */
export interface RouteRegistry {
  /** Union of all route patterns, colon-style — e.g. `"/" | "/blog/:id"`. */
  routes: string;
  /** Map of pattern → params object — e.g. `{ "/blog/:id": { id: string } }`. */
  params: Record<string, Record<string, string>>;
  /** Map of pattern → search-params object. */
  search: Record<string, Record<string, string>>;
}

// ── Package-level customization maps (stable augmentation targets) ───────────
//
// Users type search params / context per route by augmenting THESE interfaces
// on the package, e.g.:
//
//   declare module "@bractjs/bractjs" {
//     interface RouteSearchParamsMap { "/posts": { page: string } }
//   }
//
// The generated file seeds every route with a permissive default; user
// augmentations merge on top.

/** Per-route search-params shapes. Augment to type a route's search params. */
export interface RouteSearchParamsMap {}

/** Per-route context shapes. Augment to type a route's `context`. */
export interface RouteContextMap {}

// ── Resolution helpers (drive the runtime hooks/components) ──────────────────

// NOTE: these conditionals deliberately do NOT use `infer R extends RouteRegistry`.
// A constrained `infer` here silently fails to match the generated registry (its
// `search` member is an empty interface, which trips the constraint check) and
// falls back to the loose branch — defeating the whole feature. We instead infer
// each member's shape directly. `RouteRegistry` remains the documented contract
// the generated file targets.

/**
 * The app's route union when registered, else `string`. The fallback is what
 * keeps un-codegen'd apps compiling: every `to` still accepts any string.
 */
export type RegisteredRoutes = Register extends { routes: { routes: infer R } } ? R : string;

/** Pattern → params map when registered, else a permissive map. */
export type RegisteredParamsMap = Register extends { routes: { params: infer P } }
  ? P
  : Record<string, Record<string, string>>;

/** Pattern → search map when registered, else a permissive map. */
export type RegisteredSearchMap = Register extends { routes: { search: infer S } }
  ? S
  : Record<string, Record<string, string>>;

/**
 * Pattern → VALIDATED search shape (the output of each route's `searchSchema`),
 * registered by codegen under `Register.routes.searchOutput`. Distinct from
 * `RegisteredSearchMap`, which stays string-valued for the legacy
 * `useSearchParams` surface.
 */
export type RegisteredSearchOutputMap = Register extends { routes: { searchOutput: infer S } }
  ? S
  : Record<string, Record<string, unknown>>;

/** Params object for a specific route literal (`{}` for static routes). */
export type ParamsFor<TTo> = TTo extends keyof RegisteredParamsMap
  ? RegisteredParamsMap[TTo]
  : Record<string, string>;

/** Search-params object for a specific route literal. */
export type SearchFor<TTo> = TTo extends keyof RegisteredSearchMap
  ? RegisteredSearchMap[TTo]
  : Record<string, string>;

/** Validated (schema-output) search object for a specific route literal. */
export type SearchOutputFor<TTo> = TTo extends keyof RegisteredSearchOutputMap
  ? RegisteredSearchOutputMap[TTo]
  : Record<string, unknown>;

/**
 * Infer the output type of a Zod/Valibot-compatible schema — the duck-typed
 * counterpart of `z.infer`. Used by the generated route types to derive each
 * route's search shape from its `searchSchema` export.
 */
export type InferSchemaOutput<S> = S extends { parse(input: unknown): infer T }
  ? T
  : S extends { safeParse(input: unknown): infer R }
    ? Awaited<R> extends { data?: infer T }
      ? NonNullable<T>
      : Record<string, unknown>
    : Record<string, unknown>;

/** Whether a route literal carries any path params. Reserved for a future strict `<Link>` mode. */
export type HasParams<TTo> = keyof ParamsFor<TTo> extends never ? false : true;
