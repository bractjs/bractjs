// Server
export { createServer, renderRoute, redirect, json, error } from "./server/index.ts";
export { buildFetchHandler } from "./server/serve.ts";
export { defineContext } from "./server/context.ts";
export type { ContextFactory } from "./server/context.ts";
export { route } from "./server/api-route.ts";
export type { ApiRouteDefinition, AppApiRoutes } from "./server/api-route.ts";
export { validate } from "./server/validate.ts";
export type { FieldErrors, ValidationError } from "./server/validate.ts";
export type { BractAdapter } from "./server/adapter.ts";
export { BunAdapter } from "./server/adapter.ts";

// Adapters
export { createCloudflareAdapter, makeCloudflareHandler } from "./adapters/cloudflare.ts";

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
export { useClientStubPlugin, createUseServerProxyPlugin, useServerProxyPlugin } from "./build/directives.ts";
export { serverModuleStubPlugin, serverOnlyPlugin, clientEnvPlugin } from "./build/env-plugin.ts";

// Module-registry codegen (drives `bun build --compile` workflow)
export {
  writeModuleRegistries,
  writeManifestModule,
  generateRouteRegistry,
  generateActionRegistry,
  generateManifestModule,
} from "./codegen/module-registry.ts";
export type { CodegenResult } from "./codegen/module-registry.ts";
export type { ModuleRegistry } from "./server/layout.ts";

// Client RPC
export { createClient } from "./client/rpc.ts";
export type { BractJSConfig, RenderOptions, ServerManifest } from "./server/index.ts";
export { defineLifecycle } from "./server/lifecycle.ts";
export type { LifecycleHooks } from "./server/lifecycle.ts";

// Shared types
export type {
  LoaderArgs,
  ActionArgs,
  MetaDescriptor,
  MetaArgs,
  LoaderFunction,
  ActionFunction,
  MetaFunction,
  RouteModule,
  RouteDefinition,
} from "./shared/route-types.ts";
export type { RouteFile, Segment } from "./server/scanner.ts";

export { BractJSError, HttpError, isRedirect, isHttpError, isBractJSError } from "./shared/errors.ts";
export { Deferred, defer, isDeferred } from "./shared/deferred.ts";
export { BractJSContext, BractJSProvider, useBractJSContext } from "./shared/context.ts";
export type { BractJSContextValue, RouteManifest } from "./shared/context.ts";

// Middleware
export { pipeline, MiddlewarePipeline } from "./server/middleware.ts";
export type { MiddlewareFn, MiddlewareContext } from "./server/middleware.ts";
export { requestLogger } from "./middleware/requestLogger.ts";
export { cors } from "./middleware/cors.ts";
export type { CorsOptions } from "./middleware/cors.ts";
export { authGuard } from "./middleware/authGuard.ts";
export type { AuthGuardOptions, SessionStorageLike, SessionLike } from "./middleware/authGuard.ts";
export { csp, getCspNonce, CSP_NONCE_KEY } from "./server/csp.ts";
export type { CspOptions } from "./server/csp.ts";

// Session
export { createCookieSession } from "./server/session.ts";
export type { Session, SessionStorage, SessionData, CookieSessionOptions, CommitOptions } from "./server/session.ts";

// Client components
export { Scripts } from "./client/components/Scripts.tsx";
export { LiveReload } from "./client/components/LiveReload.tsx";
export { Outlet } from "./client/components/Outlet.tsx";
export { Link } from "./client/components/Link.tsx";
export { Form } from "./client/components/Form.tsx";
export { Await } from "./client/components/Await.tsx";
export { Image } from "./client/components/Image.tsx";
export type { ImageProps, ImageFormat, ImageFit } from "./client/components/Image.tsx";

// Client hooks
export { useLoaderData } from "./client/hooks/useLoaderData.ts";
export { useActionData } from "./client/hooks/useActionData.ts";
export { useParams } from "./client/hooks/useParams.ts";
export { useNavigation } from "./client/hooks/useNavigation.ts";
export { useNavigate } from "./client/hooks/useNavigate.ts";
export type { NavigateFn, NavigateOptions } from "./client/hooks/useNavigate.ts";
export { useFetcher } from "./client/hooks/useFetcher.ts";
export { useSearchParams } from "./client/hooks/useSearchParams.ts";
export type { SearchParamsResult } from "./client/hooks/useSearchParams.ts";
export { useBlocker } from "./client/hooks/useBlocker.ts";
export { useLocale } from "./client/hooks/useLocale.ts";
export { useLocalizedLink } from "./client/hooks/useLocalizedLink.ts";

// Typed-routing registration seam. Augment `Register` (done by `bractjs codegen`
// in app/route-types.gen.ts) to make <Link>, useNavigate, useParams, and
// useSearchParams type-safe. Augment RouteSearchParamsMap / RouteContextMap to
// type a route's search params / context.
export type {
  Register,
  RouteRegistry,
  RegisteredRoutes,
  ParamsFor,
  SearchFor,
  RouteSearchParamsMap,
  RouteContextMap,
} from "./client/registry.ts";
export { buildPath } from "./client/build-path.ts";

// i18n utilities (server-side)
export { wrapRoutesWithLocale, stripLocale, localizedDataPath } from "./server/i18n.ts";
export type { I18nConfig } from "./server/serve.ts";

// Programmatic API — importable alternatives to the CLI commands
export { createDevServer } from "./dev/server.ts";
export type { DevServerOptions, DevServer } from "./dev/server.ts";
export { runBuild } from "./build/bundler.ts";
export type { BuildConfig } from "./build/bundler.ts";
export { loadUserConfig } from "./config/load.ts";
