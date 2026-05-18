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
export { cssModulesPlugin, transformCssModule } from "./build/plugins/css-modules.ts";

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
export { useFetcher } from "./client/hooks/useFetcher.ts";
export { useSearchParams } from "./client/hooks/useSearchParams.ts";
export type { SearchParamsResult } from "./client/hooks/useSearchParams.ts";
export { useBlocker } from "./client/hooks/useBlocker.ts";
export { useLocale } from "./client/hooks/useLocale.ts";
export { useLocalizedLink } from "./client/hooks/useLocalizedLink.ts";

// i18n utilities (server-side)
export { wrapRoutesWithLocale, stripLocale, localizedDataPath } from "./server/i18n.ts";
export type { I18nConfig } from "./server/serve.ts";
