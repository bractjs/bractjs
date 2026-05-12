import type { Deferred } from "./deferred.ts";

export interface LoaderArgs {
  request: Request;
  params: Record<string, string>;
  context: Record<string, unknown>;
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

export interface RouteModule<TLoader = unknown, TAction = unknown> {
  loader?: LoaderFunction<TLoader>;
  action?: ActionFunction<TAction>;
  meta?: MetaFunction<TLoader>;
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
