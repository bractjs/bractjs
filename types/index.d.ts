import type { ReactNode, Context } from "react";

// ── Route types ───────────────────────────────────────────────────────────
export type {
  LoaderArgs, ActionArgs, MetaDescriptor, MetaArgs,
  LoaderFunction, ActionFunction, MetaFunction, RouteModule,
} from "./route.d.ts";

// ── Config + Server ───────────────────────────────────────────────────────
export type { BractJSConfig, ServerManifest } from "./config.d.ts";
import type { MetaDescriptor } from "./route.d.ts";
import type { BractJSConfig, ServerManifest } from "./config.d.ts";

export interface RenderOptions {
  shell: ReactNode;
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  manifest: ServerManifest;
  meta: MetaDescriptor[];
  status?: number;
}

export declare function createServer(config?: Partial<BractJSConfig>): { stop(): void };
export declare function renderRoute(options: RenderOptions): Promise<Response>;
export declare function redirect(url: string, status?: number): Response;
export declare function json<T>(data: T, init?: ResponseInit): Response;
export declare function error(message: string, status?: number): Response;

// ── Errors ────────────────────────────────────────────────────────────────
export declare class BractJSError extends Error { readonly status: number; }
export declare class HttpError extends BractJSError {
  constructor(status: number, message?: string);
}
export declare function isRedirect(value: unknown): value is Response;
export declare function isHttpError(value: unknown): value is HttpError;
export declare function isBractJSError(value: unknown): value is BractJSError;

// ── Deferred ──────────────────────────────────────────────────────────────
export declare class Deferred<T> { readonly promise: Promise<T>; }
export declare function defer<T>(data: Record<string, T | Promise<T>>): unknown;
export declare function isDeferred(value: unknown): boolean;

// ── Context ───────────────────────────────────────────────────────────────
export interface RouteManifest {
  clientEntry: string;
  routes: Record<string, { file?: string; chunk?: string }>;
}
export interface BractJSContextValue {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  manifest: RouteManifest;
}
export declare const BractJSContext: Context<BractJSContextValue>;
export declare function BractJSProvider(props: { value: BractJSContextValue; children: ReactNode }): ReactNode;
export declare function useBractJSContext(): BractJSContextValue;

// ── Session ───────────────────────────────────────────────────────────────
export type { SessionData, Session, CommitOptions, SessionStorage, CookieSessionOptions } from "./session.d.ts";
import type { SessionStorage, CookieSessionOptions } from "./session.d.ts";
export declare function createCookieSession(options: CookieSessionOptions): SessionStorage;

// ── Middleware ────────────────────────────────────────────────────────────
export type { MiddlewareContext, MiddlewareFn } from "./middleware.d.ts";
import type { MiddlewareFn, MiddlewareContext } from "./middleware.d.ts";

export declare class MiddlewarePipeline {
  use(fn: MiddlewareFn): this;
  run(ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response>;
}
export declare const pipeline: MiddlewarePipeline;

export interface CorsOptions { origin: string | string[]; methods?: string[]; }
export interface SessionStorageLike { getSession(cookie?: string | null): Promise<{ get(key: string): unknown }>; }
export interface AuthGuardOptions { session: SessionStorageLike; required?: boolean; }
export declare function requestLogger(): MiddlewareFn;
export declare function cors(options: CorsOptions): MiddlewareFn;
export declare function authGuard(options: AuthGuardOptions): MiddlewareFn;

// ── API routes (C1) ───────────────────────────────────────────────────────
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface ApiRouteDefinition<TMethod extends HttpMethod, TPath extends string, TInput, TOutput> {
  method: TMethod;
  path: TPath;
  handler: (input: TInput, request: Request) => TOutput | Promise<TOutput>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function route<TMethod extends HttpMethod, TPath extends string, TInput, TOutput>(
  method: TMethod,
  path: TPath,
  handler: (input: TInput, request: Request) => TOutput | Promise<TOutput>,
): ApiRouteDefinition<TMethod, TPath, TInput, TOutput>;
export type AppApiRoutes = never; // users extend this via codegen

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type ApiClient<TRoutes extends { method: string; path: string; input: unknown; output: unknown }> = {
  [TPath in TRoutes["path"]]: {
    [TMethod in Extract<TRoutes, { path: TPath }>["method"]]: (
      input?: Extract<TRoutes, { path: TPath; method: TMethod }>["input"],
    ) => Promise<UnwrapPromise<Extract<TRoutes, { path: TPath; method: TMethod }>["output"]>>;
  };
};
export declare function createClient<
  TRoutes extends { method: string; path: string; input: unknown; output: unknown },
>(baseUrl?: string): ApiClient<TRoutes>;

// ── Validate (C2) ────────────────────────────────────────────────────────
export interface FieldErrors { [field: string]: string[] }
export declare class ValidationError extends Error {
  readonly status: 400;
  readonly fieldErrors: FieldErrors;
}
export declare function validate<T>(
  schema: { safeParse?(i: unknown): unknown } | { parse(i: unknown): T },
  input: FormData | Record<string, unknown>,
): Promise<T>;

// ── Client components ─────────────────────────────────────────────────────
export declare function Scripts(): null;
export declare function LiveReload(): ReactNode;
export declare function Outlet(): ReactNode;

export interface LinkProps { to: string; prefetch?: "hover" | "none"; viewTransition?: boolean; children?: ReactNode; className?: string; [key: string]: unknown; }
export declare function Link(props: LinkProps): ReactNode;

export interface FormProps { method?: "post" | "put" | "delete"; action?: string; children?: ReactNode; [key: string]: unknown; }
export declare function Form(props: FormProps): ReactNode;

export interface AwaitProps<T> { resolve: Promise<T>; fallback: ReactNode; children: (data: T) => ReactNode; }
export declare function Await<T>(props: AwaitProps<T>): ReactNode;

// ── Client hooks ──────────────────────────────────────────────────────────
export declare function useLoaderData<T = unknown>(): T;
export declare function useActionData<T = unknown>(): T | null;
export declare function useParams(): Record<string, string>;
export type NavigationState = "idle" | "loading" | "submitting";
export declare function useNavigation(): { state: NavigationState };
export interface FetcherResult {
  data: unknown;
  state: NavigationState;
  load(path: string): Promise<void>;
  submit(path: string, opts: { method: string; body: FormData | Record<string, string> }): Promise<void>;
}
export interface StreamFetcherResult<T = unknown> {
  events: AsyncGenerator<T>;
  connect(actionId: string): AsyncGenerator<T>;
}
export declare function useFetcher(): FetcherResult;
export declare function useFetcher<T>(opts: { stream: true }): StreamFetcherResult<T>;

export interface SearchParamsResult<T extends Record<string, string> = Record<string, string>> {
  searchParams: URLSearchParams;
  getParam<K extends keyof T & string>(key: K): T[K] | null;
  setSearchParams(updater: Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)): void;
}
export declare function useSearchParams<T extends Record<string, string> = Record<string, string>>(): SearchParamsResult<T>;

// ── Typed route context ───────────────────────────────────────────────────
export declare function defineContext<T>(
  factory: (args: { request: Request; params: Record<string, string> }) => T | Promise<T>
): ContextFactory<T>;
export interface ContextFactory<T> {
  _factory: (args: { request: Request; params: Record<string, string> }) => T | Promise<T>;
}

// ── beforeLoad / useBlocker ───────────────────────────────────────────────
export declare function useBlocker(shouldBlock: () => boolean): void;

// ── i18n routing (E2) ────────────────────────────────────────────────────
export declare function useLocale(defaultLocale?: string): string;
export declare function useLocalizedLink(defaultLocale?: string): (path: string) => string;
export interface I18nConfig { locales: string[]; defaultLocale: string; }

// ── Adapter (D1) ──────────────────────────────────────────────────────────
export interface BractAdapter {
  fetch(request: Request): Promise<Response>;
  listen?(port: number): void;
}
export declare class BunAdapter implements BractAdapter {
  setHandler(handler: (request: Request) => Promise<Response>): void;
  fetch(request: Request): Promise<Response>;
  listen(port: number): void;
  stop(): void;
}

// ── Cloudflare adapter (D2) ───────────────────────────────────────────────
export declare function createCloudflareAdapter(
  handler: (request: Request) => Promise<Response>,
): BractAdapter & { fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> };
export declare function makeCloudflareHandler(
  handler: (request: Request) => Promise<Response>,
): { fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> };

// ── CSS Modules (D3) ─────────────────────────────────────────────────────
export declare const cssModulesPlugin: unknown; // BunPlugin
export declare function transformCssModule(filePath: string): Promise<{ map: Record<string, string>; css: string }>;

// ── buildFetchHandler (D1) ───────────────────────────────────────────────
export declare function buildFetchHandler(config: Partial<import("./config.d.ts").BractJSConfig>): (request: Request) => Promise<Response>;
