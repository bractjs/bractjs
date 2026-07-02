import type { ComponentType } from "react";

/** A parsed navigation location (see `useLocation`). `hash` is always "" during SSR. */
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
   * (repeated keys become arrays). Parameterize to skip the cast:
   * `loader({ search }: LoaderArgs<BoardSearch>)`.
   */
  search: TSearch;
}

export interface ActionArgs<TSearch extends Record<string, unknown> = Record<string, unknown>>
  extends LoaderArgs<TSearch> {
  formData: FormData;
}

/**
 * The data a route's loader resolves to, for typing `useLoaderData`. Pass the
 * loader function type to infer it (`useLoaderData<typeof loader>()` →
 * awaited return, `Response` excluded, `Deferred` fields preserved). A plain
 * object type is returned as-is (back-compat).
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
  loaderData: T;
  params: Record<string, string>;
  request: Request;
  /** Headers merged from ancestors in the chain (root → layout → this route). */
  parentHeaders: Headers;
}

/**
 * A module's optional `headers` export — set response headers (`Cache-Control`,
 * `ETag`, `Vary`, …) on the document and `/_data` responses. Runs in chain
 * order (root → layout → route); innermost wins per key.
 */
export type HeadersFunction<T = unknown> = (args: HeadersArgs<T>) => HeadersInit;

/**
 * A nested route-middleware function. Runs on the server in chain order
 * (root → layout → route) before `beforeLoad`/action/loaders, with a shared
 * mutable `context`. Return a `Response` to short-circuit; call `next()` to
 * continue.
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
 * Decide whether loader data should be refetched (SWR background refetch and
 * post-mutation revalidation). Return `args.defaultShouldRevalidate` (true)
 * for the default behavior.
 */
export interface ShouldRevalidateArgs {
  currentUrl: URL;
  nextUrl: URL;
  formMethod?: string;
  actionStatus?: number;
  defaultShouldRevalidate: boolean;
}

export type ShouldRevalidateFunction = (args: ShouldRevalidateArgs) => boolean;

/** A route's browser-side loader (RR7-style). See the package docs. */
export interface ClientLoaderFunction<T = unknown> {
  (args: {
    request: Request;
    params: Record<string, string>;
    search: Record<string, unknown>;
    serverLoader: () => Promise<unknown>;
  }): Promise<T> | T;
  /** Run on initial hydration too (default: only on client navigation). */
  hydrate?: boolean;
}

/** A route's browser-side action (RR7-style). See the package docs. */
export type ClientActionFunction<T = unknown> = (args: {
  request: Request;
  params: Record<string, string>;
  formData: FormData;
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
  /** Set response headers (Cache-Control/ETag/Vary/…) for this route's document and `/_data` responses. Chain order, innermost wins. */
  headers?: HeadersFunction<TLoader>;
  /** Nested middleware (root → layout → route), shared mutable `context`, runs before beforeLoad/action/loaders. A single fn or an array. */
  middleware?: RouteMiddlewareFunction | RouteMiddlewareFunction[];
  beforeLoad?: BeforeLoadFunction;
  shouldRevalidate?: ShouldRevalidateFunction;
  /** Zod/Valibot-compatible schema validating search params before loaders run (400 on failure). */
  searchSchema?: unknown;
  /**
   * Selective SSR: `true` (default) full SSR; `"data-only"` loaders run on the
   * server but the component renders client-only; `false` neither the route
   * loader nor the component runs during document SSR (beforeLoad still does).
   */
  ssr?: boolean | "data-only";
  /** SSR'd in the component's place for `ssr: false` / `"data-only"` routes. */
  Fallback?: ComponentType;
  handle?: Record<string, unknown>;
  ErrorBoundary?: ComponentType<{ error: unknown }>;
  default?: ComponentType;
}

/**
 * One entry in the matched route chain (see `useMatches`), outermost → innermost:
 * root, layouts, then the leaf route.
 */
export interface RouteMatch<TData = unknown, THandle = Record<string, unknown>> {
  /** Stable id of the matched module — its appDir-relative file path. */
  id: string;
  /** The active URL pathname (shared across the chain). */
  pathname: string;
  /** The matched route params (shared across the chain). */
  params: Record<string, string>;
  /** This module's loader data slice. */
  data: TData;
  /** This module's static `handle` export, or `undefined`. */
  handle: THandle | undefined;
}

/** A route's identity in the resolved route tree (id = appDir-relative file path). */
export interface RouteDefinition {
  id: string;
  path: string;
  filePath: string;
  parentId?: string;
  index?: boolean;
}

export type Segment = string | { param: string } | { optional: string } | { catchAll: string };

export interface RouteFile {
  filePath: string;
  urlPattern: string;
  segments: Segment[];
}
