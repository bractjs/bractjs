/**
 * @bractjs/bractjs — public API barrel.
 *
 * Every symbol exported here is public. The published declarations under
 * `types/` are GENERATED from this file's module graph — run
 * `bun run typegen` after changing any public signature and commit the
 * result (CI fails on a stale tree). Section-by-section usage docs live in
 * the repository README: https://github.com/bractjs/bractjs#readme
 */

// Adapters
export { createCloudflareAdapter, makeCloudflareHandler } from "./adapters/cloudflare.ts";
// Build pipeline (runBuild, runPrerender, bundler plugins) lives at
// `@bractjs/bractjs/build`; codegen (module registries for the compiled
// binary) at `@bractjs/bractjs/codegen`. See src/build-entry.ts and
// src/codegen-entry.ts.
export { buildPath } from "./client/build-path.ts";
export { Await } from "./client/components/Await.tsx";
export { Form } from "./client/components/Form.tsx";
export type { ImageFit, ImageFormat, ImageProps } from "./client/components/Image.tsx";
export { Image } from "./client/components/Image.tsx";
export { Link } from "./client/components/Link.tsx";
export { LiveReload } from "./client/components/LiveReload.tsx";
export { Outlet } from "./client/components/Outlet.tsx";
// Client components
export { Scripts } from "./client/components/Scripts.tsx";
export type { ScrollRestorationProps } from "./client/components/ScrollRestoration.tsx";
export { ScrollRestoration } from "./client/components/ScrollRestoration.tsx";
export type { ToasterProps, ToastPosition } from "./client/components/Toaster.tsx";
export { Toaster } from "./client/components/Toaster.tsx";
export type { FetcherEntry, FetcherState } from "./client/fetcher-store.ts";
export { useActionData } from "./client/hooks/useActionData.ts";
export { useBlocker } from "./client/hooks/useBlocker.ts";
export type {
  FetcherFormProps,
  FetcherResult,
  StreamFetcherResult,
  UseFetcherOptions,
} from "./client/hooks/useFetcher.ts";
export { useFetcher } from "./client/hooks/useFetcher.ts";
export { useFetchers } from "./client/hooks/useFetchers.ts";
// Client hooks
export { useLoaderData } from "./client/hooks/useLoaderData.ts";
export { useLocale } from "./client/hooks/useLocale.ts";
export { useLocalizedLink } from "./client/hooks/useLocalizedLink.ts";
export { useLocation } from "./client/hooks/useLocation.ts";
export { useMatches } from "./client/hooks/useMatches.ts";
export type { NavigateFn, NavigateOptions } from "./client/hooks/useNavigate.ts";
export { useNavigate } from "./client/hooks/useNavigate.ts";
export { useNavigation } from "./client/hooks/useNavigation.ts";
export { useParams } from "./client/hooks/useParams.ts";
export type { Revalidator } from "./client/hooks/useRevalidator.ts";
export { useRevalidator } from "./client/hooks/useRevalidator.ts";
export type { SetSearchFn, SetSearchOptions } from "./client/hooks/useSearch.ts";
export { useSearch, useSetSearch } from "./client/hooks/useSearch.ts";
export type { SearchParamsResult } from "./client/hooks/useSearchParams.ts";
export { useSearchParams } from "./client/hooks/useSearchParams.ts";
export { useToast, useToasts } from "./client/hooks/useToast.ts";
// Typed-routing registration seam. Augment `Register` (done by `bractjs codegen`
// in app/route-types.gen.ts) to make <Link>, useNavigate, useParams, and
// useSearchParams type-safe. Augment RouteSearchParamsMap / RouteContextMap to
// type a route's search params / context.
export type {
  InferSchemaOutput,
  ParamsFor,
  Register,
  RegisteredRoutes,
  RouteContextMap,
  RouteRegistry,
  RouteSearchParamsMap,
  SearchFor,
  SearchOutputFor,
} from "./client/registry.ts";
// Client RPC
export { createClient } from "./client/rpc.ts";
export { serializeSearch } from "./client/search-serializer.ts";
export type { Toast, ToastAction, ToastEntry, ToastOptions, ToastType } from "./client/toast-store.ts";
export { toast } from "./client/toast-store.ts";
export { defineConfig, loadUserConfig } from "./config/load.ts";
export type { DevServer, DevServerOptions } from "./dev/server.ts";
// Programmatic API — importable alternatives to the CLI commands
export { createDevServer } from "./dev/server.ts";
export type { AuthGuardOptions, SessionLike, SessionStorageLike } from "./middleware/authGuard.ts";
export { authGuard } from "./middleware/authGuard.ts";
export type { CorsOptions } from "./middleware/cors.ts";
export { cors } from "./middleware/cors.ts";
export { requestLogger } from "./middleware/requestLogger.ts";
export type { BractAdapter } from "./server/adapter.ts";
export { BunAdapter } from "./server/adapter.ts";
export type { ApiRouteDefinition, ApiRouteOptions, AppApiRoutes } from "./server/api-route.ts";
export { route } from "./server/api-route.ts";
export type { ContextFactory } from "./server/context.ts";
export { defineContext } from "./server/context.ts";
export type { CspOptions } from "./server/csp.ts";
export { CSP_NONCE_KEY, csp, getCspNonce } from "./server/csp.ts";
// i18n utilities (server-side)
export { localizedDataPath, stripLocale, wrapRoutesWithLocale } from "./server/i18n.ts";
export type { BractJSConfig, RenderOptions, ServerManifest } from "./server/index.ts";
// Server
export { createServer, error, json, redirect, renderRoute } from "./server/index.ts";
export type { ModuleRegistry } from "./server/layout.ts";
export type { LifecycleHooks } from "./server/lifecycle.ts";
export { defineLifecycle } from "./server/lifecycle.ts";
export type { MiddlewareContext, MiddlewareFn, RouteMiddleware } from "./server/middleware.ts";
// Middleware
export { MiddlewarePipeline, pipeline } from "./server/middleware.ts";
export type { RouteFile, Segment } from "./server/scanner.ts";
export { searchParamsToObject, validateSearch } from "./server/search.ts";
export type { I18nConfig } from "./server/serve.ts";
export { buildFetchHandler } from "./server/serve.ts";
export type {
  CommitOptions,
  CookieSessionOptions,
  Session,
  SessionData,
  SessionStorage,
} from "./server/session.ts";
// Session
export { createCookieSession } from "./server/session.ts";
export { renderSpaShell } from "./server/spa.ts";
export type { FieldErrors, SafeValidateResult } from "./server/validate.ts";
export {
  isValidationResponse,
  readValidationError,
  safeValidate,
  ValidationError,
  validate,
} from "./server/validate.ts";
export type { BractJSContextValue, RouteManifest } from "./shared/context.ts";
export { BractJSContext, BractJSProvider, useBractJSContext } from "./shared/context.ts";
export { Deferred, defer, isDeferred } from "./shared/deferred.ts";
export { defineActions } from "./shared/define-actions.ts";
export { BractJSError, HttpError, isBractJSError, isHttpError, isRedirect } from "./shared/errors.ts";
export { formText, formValues } from "./shared/form-data.ts";
// Shared types
export type {
  ActionArgs,
  ActionData,
  ActionFunction,
  ClientActionFunction,
  ClientLoaderFunction,
  HeadersArgs,
  HeadersFunction,
  LoaderArgs,
  LoaderData,
  LoaderFunction,
  MetaArgs,
  MetaDescriptor,
  MetaFunction,
  RouteDefinition,
  RouteMatch,
  RouteMiddlewareFunction,
  RouteModule,
  RouterLocation,
  ShouldRevalidateArgs,
  ShouldRevalidateFunction,
} from "./shared/route-types.ts";
