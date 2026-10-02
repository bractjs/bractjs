import type { DataWithResponseInit } from "./data.ts";
import type { RouteContext, RouterContextProvider } from "./router-context.ts";
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
export interface LoaderArgs<TSearch extends Record<string, unknown> = Record<string, unknown>> {
    request: Request;
    /** `request.url`, parsed (React Router 8's sibling `url` argument). */
    url: URL;
    params: Record<string, string>;
    /**
     * Shared per-request context: string fields set by middleware /
     * `defineContext()`, plus typed keys via `context.get(key)` /
     * `context.set(key, value)` (see `createContext`).
     */
    context: RouteContext;
    /**
     * The request's search params, validated/coerced by the route's
     * `searchSchema` export when present; otherwise the raw string record
     * (repeated keys become arrays).
     *
     * Parameterize to skip the cast in routes with a schema:
     * `loader({ search }: LoaderArgs<BoardSearch>)`.
     */
    search: TSearch;
}
export interface ActionArgs<TSearch extends Record<string, unknown> = Record<string, unknown>> extends LoaderArgs<TSearch> {
    formData: FormData;
}
/**
 * The data a route's loader resolves to, for typing `useLoaderData`.
 *
 * Pass the loader FUNCTION type and it unwraps the return (awaited, with the
 * `Response` redirect/throw branch removed): `useLoaderData<typeof loader>()`.
 * Pass a plain object type and it's returned as-is (back-compat):
 * `useLoaderData<HomeData>()`. `Deferred<V>` fields are preserved — that is the
 * shape the component receives during streaming SSR (unwrap them with `<Await>`).
 */
export type LoaderData<T> = T extends (...args: never[]) => unknown ? UnwrapData<Exclude<Awaited<ReturnType<T>>, Response>> : T;
/** `data(value, init)` returns carry `value` to the component. */
type UnwrapData<T> = T extends DataWithResponseInit<infer D> ? D : T;
/** The data a route's action resolves to, for typing `useActionData`. See {@link LoaderData}. */
export type ActionData<T> = LoaderData<T>;
export type MetaDescriptor = {
    title: string;
} | {
    name: string;
    content: string;
} | {
    property: string;
    content: string;
} | {
    [key: string]: string;
};
export interface MetaArgs<T = unknown> {
    loaderData: T;
    /** Alias of `loaderData` (Remix / React Router 7 name). */
    data: T;
    params: Record<string, string>;
    /** The request location (hash is always `""` on the server). */
    location: {
        pathname: string;
        search: string;
        hash: string;
    };
    /**
     * The matched chain up to and including this module (root → layouts → this),
     * each with its loader data and the meta descriptors resolved so far.
     */
    matches: MetaMatch[];
    /** The route's loader error when it failed (only passed to root/layout meta). */
    error?: unknown;
}
/** One entry of {@link MetaArgs.matches}. */
export interface MetaMatch {
    id: string;
    pathname: string;
    params: Record<string, string>;
    data: unknown;
    loaderData: unknown;
    handle: Record<string, unknown> | undefined;
    meta: MetaDescriptor[];
}
/**
 * A `<link>` produced by a route's `links()` export (React Router shape). Every
 * string/boolean field becomes an attribute; stylesheets are ordered after the
 * framework's own CSS.
 */
export type LinkDescriptor = {
    rel: string;
    href?: string;
    as?: string;
    type?: string;
    media?: string;
    sizes?: string;
    crossOrigin?: "anonymous" | "use-credentials";
    integrity?: string;
    hrefLang?: string;
    imageSrcSet?: string;
    imageSizes?: string;
    title?: string;
    [attr: string]: string | boolean | undefined;
};
export type LinksFunction = () => LinkDescriptor[];
export type LoaderFunction<T = unknown> = (args: LoaderArgs) => Promise<T | Response | DataWithResponseInit<T>> | T | Response | DataWithResponseInit<T>;
export type ActionFunction<T = unknown> = (args: ActionArgs) => Promise<T | Response | DataWithResponseInit<T>> | T | Response | DataWithResponseInit<T>;
export type MetaFunction<T = unknown> = (args: MetaArgs<T>) => MetaDescriptor[];
export interface HeadersArgs<T = unknown> {
    /** This route's loader data (the route slice, already awaited). */
    loaderData: T;
    params: Record<string, string>;
    request: Request;
    /**
     * The merged headers contributed by ancestors in the chain (root → layout →
     * this route). Spread these to inherit, or override individual keys. Each
     * `headers()` in the chain runs in order and sees what came before it.
     */
    parentHeaders: Headers;
    /** Headers this module's loader returned via `data(value, { headers })` (React Router). */
    loaderHeaders: Headers;
    /** Headers the route's action returned via `data(value, { headers })` — empty on GETs. */
    actionHeaders: Headers;
    /** Error headers (always empty — kept for React Router signature parity). */
    errorHeaders?: Headers;
}
/**
 * A route/layout/root module's optional `headers` export, used to set
 * response headers (e.g. `Cache-Control`, `ETag`, `Vary`) on the document and
 * `/_data` responses. Runs in chain order (root → layout → route); the
 * innermost value wins per key. Returns a `HeadersInit` (object, array of
 * tuples, or `Headers`).
 */
export type HeadersFunction<T = unknown> = (args: HeadersArgs<T>) => HeadersInit;
/**
 * A nested route-middleware function. Runs on the server in chain order
 * (root → layout → route) before `beforeLoad`, the action, and loaders. Call
 * `next()` to continue, or return a `Response` to short-circuit. The `context`
 * object is shared and mutable across the whole chain (and into loaders).
 */
export type RouteMiddlewareFunction = (ctx: {
    request: Request;
    params: Record<string, string>;
    context: RouteContext;
}, next: () => Promise<Response>) => Promise<Response | void> | Response | void;
export interface BeforeLoadArgs {
    params: Record<string, string>;
    context: RouteContext;
    location: {
        pathname: string;
        search: string;
    };
    /** Validated search params (server-side only; absent in the client-side guard). */
    search?: Record<string, unknown>;
}
export type BeforeLoadFunction = (args: BeforeLoadArgs) => void | Response | Promise<void | Response>;
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
    /** URL the mutation was submitted to, when mutation-triggered. */
    formAction?: string;
    /** The submitted FormData, when mutation-triggered. */
    formData?: FormData;
    /** Data the action returned, when mutation-triggered. */
    actionResult?: unknown;
    /**
     * `true` unless the triggering `<Link>` / `<Form>` / `navigate()` /
     * `fetcher.submit()` passed `defaultShouldRevalidate: false`. Routes without a
     * `shouldRevalidate` export follow this value directly.
     */
    defaultShouldRevalidate: boolean;
}
export type ShouldRevalidateFunction = (args: ShouldRevalidateArgs) => boolean;
/**
 * A route's optional client loader (RR7-style). Runs in the browser on
 * navigation to the route instead of just fetching the server loader. Call
 * `serverLoader()` to get this route's server loader data (the `/_data`
 * payload's route slice). Set `clientLoader.hydrate = true` to also run it
 * during the initial hydration of an SSR'd document.
 *
 * Whatever it resolves to becomes the route's `useLoaderData()` value.
 */
export interface ClientLoaderFunction<T = unknown> {
    (args: {
        request: Request;
        params: Record<string, string>;
        search: Record<string, unknown>;
        /** Per-navigation context, shared with `clientMiddleware` (`context.get(key)`). */
        context: RouterContextProvider;
        /** Fetch this route's server loader data (the `/_data` route slice). */
        serverLoader: () => Promise<unknown>;
    }): Promise<T> | T;
    /** Run on initial hydration too (default: only on client navigation). */
    hydrate?: boolean;
}
/**
 * A route's optional client action (RR7-style). Runs in the browser on a
 * `<Form>`/fetcher submission to the route instead of POSTing directly. Call
 * `serverAction()` to invoke the server action and get its data. Whatever it
 * resolves to becomes the route's `useActionData()` value.
 */
export type ClientActionFunction<T = unknown> = (args: {
    request: Request;
    params: Record<string, string>;
    formData: FormData;
    /** Per-submission context, shared with `clientMiddleware`. */
    context: RouterContextProvider;
    /** Invoke this route's server action and get its returned data. */
    serverAction: () => Promise<unknown>;
}) => Promise<T> | T;
/**
 * Browser-side middleware (React Router 8 `clientMiddleware`): runs root →
 * layouts → route around the client data work of a navigation, revalidation,
 * submission or fetcher call — the `/_data` fetch plus `clientLoader`s, or the
 * `clientAction` / server submit. Use it for client-side auth checks, timing,
 * or putting values on `context` for client loaders. `next()` runs the rest;
 * `throw redirect("/login")` navigates there instead.
 */
export type ClientMiddlewareFunction = (args: {
    request: Request;
    params: Record<string, string>;
    context: RouterContextProvider;
}, next: () => Promise<unknown>) => Promise<unknown> | unknown;
/**
 * Props every route component receives (React Router 7 `Route.ComponentProps`):
 * the route's loader data, the last action result, params and the matched chain.
 * Layout components receive their own loader slice; root receives root's.
 * `useLoaderData()` keeps working — use whichever reads better.
 */
export interface RouteComponentProps<TLoader = unknown, TAction = unknown> {
    loaderData: LoaderData<TLoader>;
    actionData: ActionData<TAction> | undefined;
    params: Record<string, string>;
    matches: RouteMatch[];
}
/** Props of a route's `ErrorBoundary` (React Router 7 `Route.ErrorBoundaryProps`). */
export interface ErrorBoundaryProps {
    error: unknown;
    params?: Record<string, string>;
    loaderData?: unknown;
}
export interface RouteModule<TLoader = unknown, TAction = unknown> {
    loader?: LoaderFunction<TLoader>;
    action?: ActionFunction<TAction>;
    /** Browser-side loader; see {@link ClientLoaderFunction}. */
    clientLoader?: ClientLoaderFunction<TLoader>;
    /** Browser-side action; see {@link ClientActionFunction}. */
    clientAction?: ClientActionFunction<TAction>;
    /** Browser-side middleware (React Router 8) — see {@link ClientMiddlewareFunction}. */
    clientMiddleware?: ClientMiddlewareFunction[];
    meta?: MetaFunction<TLoader>;
    /** `<link>` tags for this route (React Router `links`), hoisted into `<head>`. */
    links?: LinksFunction;
    /**
     * Set response headers (`Cache-Control`, `ETag`, `Vary`, CDN hints, …) for
     * this route's document and `/_data` responses. Runs in chain order
     * (root → layout → route); innermost wins per key, and each call receives the
     * `parentHeaders` accumulated so far. Skipped for mutations and error responses.
     */
    headers?: HeadersFunction<TLoader>;
    /**
     * Nested middleware for this route/layout/root. Runs on the server in chain
     * order (root → layout → route) before `beforeLoad`/action/loaders, with a
     * shared mutable `context`. A single function or an array. Return a
     * `Response` to short-circuit; call `next()` to continue. Runs *inside* the
     * global `pipeline` middleware.
     */
    middleware?: RouteMiddlewareFunction | RouteMiddlewareFunction[];
    /** React Router 7.3–7.8 name for {@link RouteModule.middleware}; read when `middleware` is absent. */
    unstable_middleware?: RouteMiddlewareFunction | RouteMiddlewareFunction[];
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
    /**
     * React Router name for the placeholder rendered while a `clientLoader`
     * with `hydrate = true` runs (the route SSRs this instead of its component —
     * like `ssr = "data-only"`). Also accepted in place of `Fallback`.
     */
    HydrateFallback?: React.ComponentType;
    handle?: Record<string, unknown>;
    ErrorBoundary?: React.ComponentType<{
        error: unknown;
    }>;
    /**
     * root.tsx only (React Router's root `Layout`): the document shell —
     * `<html>`, `<head>`, `<body>` — wrapping whatever renders inside it: the
     * root component normally, or root's `ErrorBoundary` when the root loader
     * fails. Without it, root's default export renders the document itself.
     */
    Layout?: React.ComponentType<{
        children?: React.ReactNode;
    }>;
    /** The route component. Receives {@link RouteComponentProps} (optional to declare). */
    default?: React.ComponentType;
}
export interface RouteDefinition {
    id: string;
    path: string;
    filePath: string;
    parentId?: string;
    index?: boolean;
}
/**
 * One entry in the matched route chain, as returned by `useMatches()`. The
 * array runs outermost → innermost: root, then each layout, then the leaf
 * route. Use it for breadcrumbs and conditional chrome driven by each route's
 * `handle` export.
 */
export interface RouteMatch<TData = unknown, THandle = Record<string, unknown>> {
    /** Stable id of the matched module — its appDir-relative file path (e.g. "routes/blog/[id].tsx", "root.tsx"). */
    id: string;
    /** The active URL pathname (same for every entry — they all share the matched location). */
    pathname: string;
    /** The matched route params (shared across the chain). */
    params: Record<string, string>;
    /** This module's loader data slice (root / the matching layout / the route). */
    data: TData;
    /** This module's static `handle` export, or `undefined` if none. */
    handle: THandle | undefined;
}
/** React Router name for {@link LoaderArgs}. */
export type LoaderFunctionArgs = LoaderArgs;
/** React Router name for {@link ActionArgs}. */
export type ActionFunctionArgs = ActionArgs;
/** React Router name for the `clientLoader` argument. */
export type ClientLoaderFunctionArgs = Parameters<ClientLoaderFunction>[0];
/** React Router name for the `clientAction` argument. */
export type ClientActionFunctionArgs = Parameters<ClientActionFunction>[0];
/** React Router name for {@link ShouldRevalidateArgs}. */
export type ShouldRevalidateFunctionArgs = ShouldRevalidateArgs;
/** React Router name for {@link RouteMiddlewareFunction}. */
export type MiddlewareFunction = RouteMiddlewareFunction;
export {};
