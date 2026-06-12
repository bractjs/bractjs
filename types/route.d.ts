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
  args: LoaderArgs,
) => Promise<T | Response> | T | Response;

export type ActionFunction<T = unknown> = (
  args: ActionArgs,
) => Promise<T | Response> | T | Response;

export type MetaFunction<T = unknown> = (args: MetaArgs<T>) => MetaDescriptor[];

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

export interface RouteModule<TLoader = unknown, TAction = unknown> {
  loader?: LoaderFunction<TLoader>;
  action?: ActionFunction<TAction>;
  meta?: MetaFunction<TLoader>;
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

export type Segment = string | { param: string } | { catchAll: string };

export interface RouteFile {
  filePath: string;
  urlPattern: string;
  segments: Segment[];
}
