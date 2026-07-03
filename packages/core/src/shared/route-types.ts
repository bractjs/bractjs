import type { Deferred } from "./deferred.ts";

/**
 * A parsed navigation location. `key` is the stable identity of the history
 * entry (used by scroll restoration); `state` is the value passed via
 * `navigate(to, { state })`. During SSR `hash` is always `""` (the fragment
 * never reaches the server) and `key` is `"default"`.
 */
export interface RouterLocation {
  pathname: string;
  /** Raw query string including the leading `?`, or `""`. */
  search: string;
  /** Fragment including the leading `#`, or `""`. */
  hash: string;
  state: unknown;
  key: string;
}

export interface LoaderArgs<TSearch extends Record<string, unknown> = Record<string, unknown>> {
  request: Request;
  params: Record<string, string>;
  context: Record<string, unknown>;
  /**
   * The request's search params, validated/coerced by the route's
   * `searchSchema` export when present; otherwise the raw string record
   * (repeated keys become arrays).
   *
   * Parameterize to skip the cast in routes with a schema:
   * `loader({ search }: LoaderArgs<BoardSearch>)`.
   */
  search: TSearch;
}

export interface ActionArgs<TSearch extends Record<string, unknown> = Record<string, unknown>>
  extends LoaderArgs<TSearch> {
  formData: FormData;
}

/**
 * The data a route's loader resolves to, for typing `useLoaderData`.
 *
 * Pass the loader FUNCTION type and it unwraps the return (awaited, with the
 * `Response` redirect/throw branch removed): `useLoaderData<typeof loader>()`.
 * Pass a plain object type and it's returned as-is (back-compat):
 * `useLoaderData<HomeData>()`. `Deferred<V>` fields are preserved — that is the
 * shape the component receives during streaming SSR (unwrap them with `<Await>`).
 */
export type LoaderData<T> = T extends (...args: never[]) => unknown
  ? Exclude<Awaited<ReturnType<T>>, Response>
  : T;

/** The data a route's action resolves to, for typing `useActionData`. See {@link LoaderData}. */
export type ActionData<T> = LoaderData<T>;

export type MetaDescriptor =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { [key: string]: string };

export interface MetaArgs<T = unknown> {
  loaderData: T;
  params: Record<string, string>;
}

export type LoaderFunction<T = unknown> = (args: LoaderArgs) => Promise<T | Response> | T | Response;

export type ActionFunction<T = unknown> = (args: ActionArgs) => Promise<T | Response> | T | Response;

export type MetaFunction<T = unknown> = (args: MetaArgs<T>) => MetaDescriptor[];

export interface HeadersArgs<T = unknown> {
  /** This route's loader data (the route slice, already awaited). */
  loaderData: T;
  params: Record<string, string>;
  request: Request;
  /**
   * The merged headers contributed by ancestors in the chain (root → layout →
   * this route). Spread these to inherit, or override individual keys. Each
   * `headers()` in the chain runs in order and sees what came before it.
   */
  parentHeaders: Headers;
}

/**
 * A route/layout/root module's optional `headers` export, used to set
 * response headers (e.g. `Cache-Control`, `ETag`, `Vary`) on the document and
 * `/_data` responses. Runs in chain order (root → layout → route); the
 * innermost value wins per key. Returns a `HeadersInit` (object, array of
 * tuples, or `Headers`).
 */
export type HeadersFunction<T = unknown> = (args: HeadersArgs<T>) => HeadersInit;

/**
 * A nested route-middleware function. Runs on the server in chain order
 * (root → layout → route) before `beforeLoad`, the action, and loaders. Call
 * `next()` to continue, or return a `Response` to short-circuit. The `context`
 * object is shared and mutable across the whole chain (and into loaders).
 */
export type RouteMiddlewareFunction = (
  ctx: { request: Request; params: Record<string, string>; context: Record<string, unknown> },
  next: () => Promise<Response>,
) => Promise<Response>;

export interface BeforeLoadArgs {
  params: Record<string, string>;
  context: Record<string, unknown>;
  location: { pathname: string; search: string };
  /** Validated search params (server-side only; absent in the client-side guard). */
  search?: Record<string, unknown>;
}

export type BeforeLoadFunction = (args: BeforeLoadArgs) => void | Response | Promise<void | Response>;

/**
 * Decide whether loader data should be refetched. Evaluated on the CLIENT for
 * (a) the stale-while-revalidate background refetch and (b) the automatic
 * revalidation after a `<Form>`/fetcher mutation. Return
 * `args.defaultShouldRevalidate` (true) to keep the default behavior.
 */
export interface ShouldRevalidateArgs {
  currentUrl: URL;
  nextUrl: URL;
  /** Present when the revalidation was triggered by a mutation. */
  formMethod?: string;
  /** HTTP status the action responded with, when mutation-triggered. */
  actionStatus?: number;
  defaultShouldRevalidate: boolean;
}

export type ShouldRevalidateFunction = (args: ShouldRevalidateArgs) => boolean;

/**
 * A route's optional client loader (RR7-style). Runs in the browser on
 * navigation to the route instead of just fetching the server loader. Call
 * `serverLoader()` to get this route's server loader data (the `/_data`
 * payload's route slice). Set `clientLoader.hydrate = true` to also run it
 * during the initial hydration of an SSR'd document.
 *
 * Whatever it resolves to becomes the route's `useLoaderData()` value.
 */
export interface ClientLoaderFunction<T = unknown> {
  (args: {
    request: Request;
    params: Record<string, string>;
    search: Record<string, unknown>;
    /** Fetch this route's server loader data (the `/_data` route slice). */
    serverLoader: () => Promise<unknown>;
  }): Promise<T> | T;
  /** Run on initial hydration too (default: only on client navigation). */
  hydrate?: boolean;
}

/**
 * A route's optional client action (RR7-style). Runs in the browser on a
 * `<Form>`/fetcher submission to the route instead of POSTing directly. Call
 * `serverAction()` to invoke the server action and get its data. Whatever it
 * resolves to becomes the route's `useActionData()` value.
 */
export type ClientActionFunction<T = unknown> = (args: {
  request: Request;
  params: Record<string, string>;
  formData: FormData;
  /** Invoke this route's server action and get its returned data. */
  serverAction: () => Promise<unknown>;
}) => Promise<T> | T;

export interface RouteModule<TLoader = unknown, TAction = unknown> {
  loader?: LoaderFunction<TLoader>;
  action?: ActionFunction<TAction>;
  /** Browser-side loader; see {@link ClientLoaderFunction}. */
  clientLoader?: ClientLoaderFunction<TLoader>;
  /** Browser-side action; see {@link ClientActionFunction}. */
  clientAction?: ClientActionFunction<TAction>;
  meta?: MetaFunction<TLoader>;
  /**
   * Set response headers (`Cache-Control`, `ETag`, `Vary`, CDN hints, …) for
   * this route's document and `/_data` responses. Runs in chain order
   * (root → layout → route); innermost wins per key, and each call receives the
   * `parentHeaders` accumulated so far. Skipped for mutations and error responses.
   */
  headers?: HeadersFunction<TLoader>;
  /**
   * Nested middleware for this route/layout/root. Runs on the server in chain
   * order (root → layout → route) before `beforeLoad`/action/loaders, with a
   * shared mutable `context`. A single function or an array. Return a
   * `Response` to short-circuit; call `next()` to continue. Runs *inside* the
   * global `pipeline` middleware.
   */
  middleware?: RouteMiddlewareFunction | RouteMiddlewareFunction[];
  beforeLoad?: BeforeLoadFunction;
  shouldRevalidate?: ShouldRevalidateFunction;
  /**
   * Zod/Valibot-compatible schema validating the route's search params before
   * loaders run. Failure → 400; use `.catch()`/`.default()` per field for
   * URLs that must tolerate junk values.
   */
  searchSchema?: unknown;
  /**
   * Selective SSR (TanStack-style):
   * - `true` (default) — full document SSR with loader data.
   * - `"data-only"` — loaders run on the server, but the component renders
   *   only on the client (`Fallback` SSRs in its place).
   * - `false` — neither the route loader nor the component runs during
   *   document SSR; the client fetches `/_data` after hydration. `beforeLoad`
   *   STILL runs on the server — it is the auth gate.
   */
  ssr?: boolean | "data-only";
  /** SSR'd in the component's place for `ssr: false` / `"data-only"` routes (HydrateFallback equivalent). */
  Fallback?: React.ComponentType;
  handle?: Record<string, unknown>;
  ErrorBoundary?: React.ComponentType<{ error: unknown }>;
  default?: React.ComponentType;
}

export interface RouteDefinition {
  id: string;
  path: string;
  filePath: string;
  parentId?: string;
  index?: boolean;
}

/**
 * One entry in the matched route chain, as returned by `useMatches()`. The
 * array runs outermost → innermost: root, then each layout, then the leaf
 * route. Use it for breadcrumbs and conditional chrome driven by each route's
 * `handle` export.
 */
export interface RouteMatch<TData = unknown, THandle = Record<string, unknown>> {
  /** Stable id of the matched module — its appDir-relative file path (e.g. "routes/blog/[id].tsx", "root.tsx"). */
  id: string;
  /** The active URL pathname (same for every entry — they all share the matched location). */
  pathname: string;
  /** The matched route params (shared across the chain). */
  params: Record<string, string>;
  /** This module's loader data slice (root / the matching layout / the route). */
  data: TData;
  /** This module's static `handle` export, or `undefined` if none. */
  handle: THandle | undefined;
}
