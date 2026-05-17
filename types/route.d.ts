import type { ComponentType } from "react";

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
}

export type BeforeLoadFunction = (
  args: BeforeLoadArgs,
) => void | Response | Promise<void | Response>;

export interface RouteModule<TLoader = unknown, TAction = unknown> {
  loader?: LoaderFunction<TLoader>;
  action?: ActionFunction<TAction>;
  meta?: MetaFunction<TLoader>;
  beforeLoad?: BeforeLoadFunction;
  handle?: Record<string, unknown>;
  ErrorBoundary?: ComponentType<{ error: unknown }>;
  default?: ComponentType;
}
