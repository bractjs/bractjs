import type { ReactNode, Context, CSSProperties } from "react";

// ── Route types ───────────────────────────────────────────────────────────
export type {
  LoaderArgs, ActionArgs, MetaDescriptor, MetaArgs,
  LoaderFunction, ActionFunction, MetaFunction, RouteModule,
  RouteFile, Segment, RouterLocation,
  ShouldRevalidateArgs, ShouldRevalidateFunction,
  LoaderData, ActionData,
} from "./route.d.ts";
import type { RouterLocation, LoaderData, ActionData, ActionArgs } from "./route.d.ts";

// ── Config + Server ───────────────────────────────────────────────────────
export type { BractJSConfig, ServerManifest, BuildConfig } from "./config.d.ts";
import type { MetaDescriptor } from "./route.d.ts";
import type { BractJSConfig, ServerManifest } from "./config.d.ts";

export interface RenderOptions {
  shell: ReactNode;
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  /** Validated search params — hydrates `useSearch()` on the client. */
  search?: Record<string, unknown>;
  manifest: ServerManifest;
  meta: MetaDescriptor[];
  status?: number;
  routeFile?: string;
  nonce?: string;
  /** Set when the document did not SSR the route component (selective SSR / SPA shell). */
  ssrMode?: "client-only" | "data-only" | "spa";
}

export type OnErrorHook = (err: unknown, request?: Request) => Promise<void> | void;

export interface LifecycleHooks {
  onStart?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
  /** Called for every unexpected error: loader failures, action throws, and uncaught process exceptions. Redirects and HttpErrors are NOT reported here. The request is undefined for process-level exceptions. */
  onError?: OnErrorHook;
}
export declare function defineLifecycle(hooks: LifecycleHooks): LifecycleHooks;
export declare function createServer(config?: Partial<BractJSConfig>): { stop(): void };
export declare function renderRoute(options: RenderOptions): Promise<Response>;
export interface RedirectOptions { allowExternal?: boolean; }
export declare function redirect(url: string, status?: number, headers?: HeadersInit, options?: RedirectOptions): Response;
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
  /** The request's location, so `useLocation()` works during SSR (hash is always ""). */
  location?: RouterLocation;
  /** Validated search params, so `useSearch()` works during SSR. */
  search?: Record<string, unknown>;
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

export type SafeValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors; firstError: string };
/** Non-throwing validate(): returns a result instead of throwing a 400. */
export declare function safeValidate<T>(
  schema: { safeParse?(i: unknown): unknown } | { parse(i: unknown): T },
  input: FormData | Record<string, unknown>,
): Promise<SafeValidateResult<T>>;
/** True for the 400 Response thrown by validate()/searchSchema validation. */
export declare function isValidationResponse(value: unknown): value is Response;
/** Parse the `{ errors }` body of a validation 400 into field errors + first message. */
export declare function readValidationError(
  res: Response,
): Promise<{ fieldErrors: FieldErrors; firstError: string }>;

// ── FormData helpers ──────────────────────────────────────────────────────
/** String field from FormData; "" when missing or a File. */
export declare function formText(formData: FormData, key: string): string;
/** Collect string fields from FormData (all, or a named subset). */
export declare function formValues(formData: FormData, keys?: string[]): Record<string, string>;

// ── Search-param validation ───────────────────────────────────────────────
/** URLSearchParams → plain object; repeated keys collapse into arrays. */
export declare function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]>;
/**
 * Validate a URL's search params against a route's `searchSchema`. No schema →
 * the raw string record; failure → throws a 400 Response with field errors.
 */
export declare function validateSearch(schema: unknown, url: URL): Promise<Record<string, unknown>>;
/** Serialize a search object back into a query string (leading `?`, or ""). */
export declare function serializeSearch(search: Record<string, unknown>): string;

// ── Typed-routing registration seam ───────────────────────────────────────
// Mirror of src/client/registry.ts. Augment `Register` (done by `bractjs codegen`
// in app/route-types.gen.ts) to make <Link>/useNavigate/useParams/useSearchParams
// type-safe. Un-augmented, everything falls back to loose `string` / Record so
// apps that never run codegen keep compiling. Keep in sync with registry.ts.
export interface Register {}
export interface RouteRegistry {
  routes: string;
  params: Record<string, Record<string, string>>;
  search: Record<string, Record<string, string>>;
}
export interface RouteSearchParamsMap {}
export interface RouteContextMap {}
// Infer each member directly (NOT `infer R extends RouteRegistry` — a constrained
// infer fails to match the generated registry and falls back to loose). Keep in
// sync with src/client/registry.ts.
export type RegisteredRoutes =
  Register extends { routes: { routes: infer R } } ? R : string;
export type RegisteredParamsMap =
  Register extends { routes: { params: infer P } } ? P : Record<string, Record<string, string>>;
export type RegisteredSearchMap =
  Register extends { routes: { search: infer S } } ? S : Record<string, Record<string, string>>;
export type RegisteredSearchOutputMap =
  Register extends { routes: { searchOutput: infer S } } ? S : Record<string, Record<string, unknown>>;
export type ParamsFor<TTo> =
  TTo extends keyof RegisteredParamsMap ? RegisteredParamsMap[TTo] : Record<string, string>;
export type SearchFor<TTo> =
  TTo extends keyof RegisteredSearchMap ? RegisteredSearchMap[TTo] : Record<string, string>;
/** Validated (schema-output) search object for a specific route literal. */
export type SearchOutputFor<TTo> =
  TTo extends keyof RegisteredSearchOutputMap ? RegisteredSearchOutputMap[TTo] : Record<string, unknown>;
/** Infer the output type of a Zod/Valibot-compatible schema (duck-typed z.infer). */
export type InferSchemaOutput<S> =
  S extends { parse(input: unknown): infer T } ? T :
  S extends { safeParse(input: unknown): infer R }
    ? (Awaited<R> extends { data?: infer T } ? NonNullable<T> : Record<string, unknown>)
    : Record<string, unknown>;
export declare function buildPath(pattern: string, params: Record<string, string | number>): string;

// ── Client components ─────────────────────────────────────────────────────
export declare function Scripts(): null;
export declare function LiveReload(): ReactNode;
export declare function Outlet(): ReactNode;

export type LinkProps<TTo extends RegisteredRoutes = RegisteredRoutes> = {
  to: TTo | (string & {});
  params?: ParamsFor<TTo>;
  /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
  search?: Partial<SearchOutputFor<TTo>>;
  /** When to prefetch the target's chunk + loader data. Default "none". */
  prefetch?: "none" | "intent" | "hover" | "viewport" | "render";
  viewTransition?: boolean;
  /** Replace the current history entry instead of pushing. */
  replace?: boolean;
  children?: ReactNode;
  className?: string;
  [key: string]: unknown;
};
export declare function Link<TTo extends RegisteredRoutes = RegisteredRoutes>(props: LinkProps<TTo>): ReactNode;

export interface ScrollRestorationProps {
  /** Derive the storage key for a location. Default: `location.key`. */
  getKey?: (location: RouterLocation) => string;
  storageKey?: string;
}
/** Restores scroll on back/forward, scrolls to top (or `#hash`) on new navigations. Render once in root.tsx. */
export declare function ScrollRestoration(props?: ScrollRestorationProps): null;

export interface FormProps { method?: "post" | "put" | "delete"; action?: string; /** Renders a hidden `intent` input (pairs with defineActions()). */ intent?: string; children?: ReactNode; [key: string]: unknown; }
export declare function Form(props: FormProps): ReactNode;

// ── defineActions (intent dispatch) ───────────────────────────────────────
/** Compose a route action from per-intent handlers, dispatching on the form's `intent` field. */
export declare function defineActions<M extends Record<string, (args: ActionArgs) => unknown>>(
  handlers: M,
): (args: ActionArgs) => Promise<Awaited<ReturnType<M[keyof M]>> | Response>;

export interface AwaitProps<T> { resolve: Promise<T> | Deferred<T>; fallback: ReactNode; children: (data: T) => ReactNode; }
export declare function Await<T>(props: AwaitProps<T>): ReactNode;

export type ImageFormat = "webp" | "avif" | "jpeg" | "png";
export type ImageFit = "cover" | "contain" | "fill";
export interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
  fit?: ImageFit;
  priority?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
}
export declare function Image(props: ImageProps): ReactNode;

// ── Client hooks ──────────────────────────────────────────────────────────
// Pass the loader/action function type to infer the data — useLoaderData<typeof loader>().
export declare function useLoaderData<T = unknown>(): LoaderData<T>;
export declare function useActionData<T = unknown>(): ActionData<T> | null;
/** The current location — reactive on the client, request-derived during SSR. */
export declare function useLocation(): RouterLocation;
export declare function useParams<TTo extends string>(): ParamsFor<TTo>;
export declare function useParams<T extends Record<string, string> = Record<string, string>>(): T;
export type NavigationState = "idle" | "loading" | "submitting";
export declare function useNavigation(): { state: NavigationState };

export interface NavigateOptions<TTo extends RegisteredRoutes = RegisteredRoutes> {
  params?: ParamsFor<TTo>;
  /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
  search?: Partial<SearchOutputFor<TTo>>;
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Arbitrary history state, readable via `useLocation().state` after navigating. */
  state?: unknown;
}
export interface NavigateFn {
  <TTo extends RegisteredRoutes>(to: TTo | (string & {}), options?: NavigateOptions<TTo>): Promise<void>;
}
export declare function useNavigate(): NavigateFn;

// ── Fetchers ──────────────────────────────────────────────────────────────
export type FetcherState = "idle" | "loading" | "submitting";
export interface FetcherEntry {
  key: string;
  state: FetcherState;
  data: unknown;
  /** The submitted form data while a submission is in flight — the optimistic-UI source. */
  formData?: FormData;
  formMethod?: string;
}
export interface FetcherFormProps {
  method?: "post" | "put" | "delete";
  action?: string;
  /** Renders a hidden `intent` input (pairs with defineActions()). */
  intent?: string;
  children?: ReactNode;
  [key: string]: unknown;
}
export interface FetcherResult {
  data: unknown;
  state: FetcherState;
  formData?: FormData;
  formMethod?: string;
  key: string;
  load(path: string): Promise<void>;
  submit(path: string, opts: { method: string; body: FormData | Record<string, string> }): Promise<void>;
  /** A form that submits through this fetcher (no navigation, no history). */
  Form: (props: FetcherFormProps) => ReactNode;
}
export interface StreamFetcherResult<T = unknown> {
  /** @deprecated Never emitted — call `connect(actionId)` instead. Removed in 0.2. */
  events: AsyncGenerator<T>;
  connect(actionId: string): AsyncGenerator<T>;
}
export interface UseFetcherOptions { key?: string; stream?: boolean }
export declare function useFetcher(opts?: { key?: string }): FetcherResult;
export declare function useFetcher<T>(opts: { stream: true }): StreamFetcherResult<T>;
/** Every active fetcher — the cross-component view for optimistic UI. */
export declare function useFetchers(): FetcherEntry[];

// ── Revalidation ──────────────────────────────────────────────────────────
export interface Revalidator {
  revalidate(): Promise<void>;
  state: "idle" | "loading";
}
/** Manually re-run the active route's loaders (respects `shouldRevalidate`). */
export declare function useRevalidator(): Revalidator;

// ── Typed search ──────────────────────────────────────────────────────────
/** The current route's VALIDATED search params (its `searchSchema` output). */
export declare function useSearch<TTo extends string>(): SearchOutputFor<TTo>;
export declare function useSearch<T extends Record<string, unknown>>(): T;
export interface SetSearchOptions { replace?: boolean }
export type SetSearchFn<T extends Record<string, unknown>> = (
  updater: Partial<T> | ((prev: T) => Partial<T>),
  options?: SetSearchOptions,
) => Promise<void>;
/** Merge a patch into the current search params and soft-navigate (loaders re-run). */
export declare function useSetSearch<TTo extends string>(): SetSearchFn<SearchOutputFor<TTo>>;
export declare function useSetSearch<T extends Record<string, unknown>>(): SetSearchFn<T>;

export interface SearchParamsResult<T extends Record<string, string> = Record<string, string>> {
  searchParams: URLSearchParams;
  getParam<K extends keyof T & string>(key: K): T[K] | null;
  setSearchParams(updater: Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)): void;
}
export declare function useSearchParams<TTo extends string>(): SearchParamsResult<SearchFor<TTo>>;
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

// ── Build plugins (required for native `bun build --compile` workflow) ───
//
// Apply all of these on the relevant bundle or face crashes / secret leaks:
//   server bundle  → useClientStubPlugin
//   client bundle  → createUseServerProxyPlugin(appDir), serverOnlyPlugin,
//                    clientEnvPlugin(allowedKeys, env), cssModulesPlugin
export declare const useClientStubPlugin: unknown; // BunPlugin
export declare function createUseServerProxyPlugin(appDir?: string): unknown; // BunPlugin
export declare const useServerProxyPlugin: unknown; // BunPlugin (legacy — uses absolute paths)
export declare const serverOnlyPlugin: unknown; // BunPlugin
export declare function clientEnvPlugin(
  allowedKeys: string[],
  envValues: Record<string, string>,
): unknown; // BunPlugin

// ── Module-registry codegen (drives `bun build --compile`) ────────────────
export interface CodegenResult {
  routesPath: string;
  actionsPath: string;
}
/** Scan appDir; write `<appDir>/_generated/routes.ts` and `actions.ts`. */
export declare function writeModuleRegistries(appDir: string): Promise<CodegenResult>;
/** Read `<buildDir>/route-manifest.json`; write `<appDir>/_generated/manifest.ts`. */
export declare function writeManifestModule(appDir: string, buildDir: string): Promise<string>;

/** Pre-loaded route/layout/root modules keyed by appDir-relative path. */
export type ModuleRegistry = Record<string, import("./route.d.ts").RouteModule | Record<string, unknown>>;

// ── buildFetchHandler (D1) ───────────────────────────────────────────────
export declare function buildFetchHandler(config: Partial<import("./config.d.ts").BractJSConfig>): (request: Request) => Promise<Response>;

// ── Programmatic API ─────────────────────────────────────────────────────
export declare function runBuild(config: import("./config.d.ts").BuildConfig): Promise<void>;

export interface DevServerOptions {
  port?: number;
  hmrPort?: number;
  config?: Partial<BractJSConfig>;
  skipUserConfig?: boolean;
}
export interface DevServer {
  stop(): void;
}
export declare function createDevServer(options?: DevServerOptions): Promise<DevServer>;

export declare function loadUserConfig(): Promise<Partial<BractJSConfig>>;

/** Identity helper for bractjs.config.ts — wrap your default export for autocomplete + type-checking. */
export declare function defineConfig(config: Partial<BractJSConfig>): Partial<BractJSConfig>;

// ── Prerendering / SPA shell ──────────────────────────────────────────────
export interface PrerenderOptions {
  prerender: string[] | (() => string[] | Promise<string[]>);
  appDir?: string;
  publicDir?: string;
  buildDir?: string;
  manifest?: ServerManifest;
}
export interface PrerenderResult { written: string[] }
/** Build-time prerendering (SSG): write HTML + /_data payloads under `<buildDir>/client/_prerender/`. */
export declare function runPrerender(options: PrerenderOptions): Promise<PrerenderResult>;
/** Render the SPA-mode document shell (config `ssr: false`). */
export declare function renderSpaShell(
  appDir: string,
  manifest: ServerManifest,
  registry?: ModuleRegistry,
): Promise<string>;
