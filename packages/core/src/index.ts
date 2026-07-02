/**
 * @bractjs/bractjs — public API barrel.
 *
 * Every symbol exported here is public and must be mirrored in the
 * hand-maintained declarations under `types/` (`types/index.d.ts` is the type
 * surface consumers actually see — an export missing there is invisible to
 * TypeScript users). Section-by-section usage docs live in the repository
 * README: https://github.com/bractjs/bractjs#readme
 */

// Adapters
export { createCloudflareAdapter, makeCloudflareHandler } from "./adapters/cloudflare.ts";
export type { BuildConfig } from "./build/bundler.ts";
export { runBuild } from "./build/bundler.ts";
export { createUseServerProxyPlugin, useClientStubPlugin, useServerProxyPlugin } from "./build/directives.ts";
export { clientEnvPlugin, serverModuleStubPlugin, serverOnlyPlugin } from "./build/env-plugin.ts";
// Build plugins
//
// These plugins are REQUIRED when users compose their own `Bun.build` call
// (e.g. native `bun build --compile` or a custom client bundle step). Missing
// any of them breaks security or runtime behaviour:
//
// - `useClientStubPlugin` (server bundle): replaces "use client" modules with
//   null stubs. Without it, the server binary crashes when React tries to
//   call browser-only hooks/APIs.
// - `createUseServerProxyPlugin(appDir)` (client bundle): replaces
//   "use server" exports with fetch proxies. Without it, server-action
//   bodies — including DB queries and secrets — ship inside the browser JS.
// - `serverModuleStubPlugin` (client bundle): replaces every export of a
//   `*.server.ts` module with an inert stub. Because BractJS ships the whole
//   route module (loader + action included) to the client, a route that imports
//   a server module inside its loader pulls that module into the client graph;
//   stubbing keeps the import resolvable while guaranteeing zero server source
//   (DB drivers, secrets) reaches the browser. The stubs throw if ever used on
//   the client. This is the plugin the dev and production client builds use.
// - `serverOnlyPlugin` (client bundle, legacy): the stricter predecessor that
//   *hard-fails* any `*.server.ts` import. Kept for back-compat / opt-in use
//   when you want server-module imports to be a build error rather than a stub.
// - `clientEnvPlugin(allowedKeys, env)` (client bundle): allowlists which
//   `process.env.*` references survive into the browser bundle.
// - `cssModulesPlugin` (client bundle): handles `*.module.css` imports.
export { cssModulesPlugin, transformCssModule } from "./build/plugins/css-modules.ts";
export type { PrerenderOptions, PrerenderResult } from "./build/prerender.ts";
export { runPrerender } from "./build/prerender.ts";
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
export { toast, toastStore } from "./client/toast-store.ts";
export type { CodegenResult } from "./codegen/module-registry.ts";
// Module-registry codegen (drives `bun build --compile` workflow)
export {
  generateActionRegistry,
  generateManifestModule,
  generateRouteRegistry,
  writeManifestModule,
  writeModuleRegistries,
} from "./codegen/module-registry.ts";
// Route-type codegen helpers (staleness detection for route-types.gen.ts)
export { explainStaleness, routesFingerprint } from "./codegen/route-codegen.ts";
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
export {
  collectRouteMiddleware,
  MiddlewarePipeline,
  pipeline,
  runRouteMiddleware,
} from "./server/middleware.ts";
export { hasForbiddenKey, nullProtoFromEntries } from "./server/proto-guard.ts";
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
