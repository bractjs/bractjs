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

export interface LoaderArgs {
  request: Request;
  params: Record<string, string>;
  context: Record<string, unknown>;
  /**
   * The request's search params, validated/coerced by the route's
   * `searchSchema` export when present; otherwise the raw string record
   * (repeated keys become arrays).
   */
  search: Record<string, unknown>;
}

export interface ActionArgs extends LoaderArgs {
  formData: FormData;
}

export type MetaDescriptor =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { [key: string]: string };

export interface MetaArgs<T = unknown> {
  loaderData: T;
  params: Record<string, string>;
}

export type LoaderFunction<T = unknown> = (
  args: LoaderArgs
) => Promise<T | Response> | T | Response;

export type ActionFunction<T = unknown> = (
  args: ActionArgs
) => Promise<T | Response> | T | Response;

export type MetaFunction<T = unknown> = (
  args: MetaArgs<T>
) => MetaDescriptor[];

export interface BeforeLoadArgs {
  params: Record<string, string>;
  context: Record<string, unknown>;
  location: { pathname: string; search: string };
  /** Validated search params (server-side only; absent in the client-side guard). */
  search?: Record<string, unknown>;
}

export type BeforeLoadFunction = (
  args: BeforeLoadArgs,
) => void | Response | Promise<void | Response>;

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

export interface RouteModule<TLoader = unknown, TAction = unknown> {
  loader?: LoaderFunction<TLoader>;
  action?: ActionFunction<TAction>;
  meta?: MetaFunction<TLoader>;
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
