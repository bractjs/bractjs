# Bract — Framework Architecture

> A production-grade SSR web framework built on Bun.sh + React 19.
> Zero external framework dependencies. File-based routing. Streaming by default.
>
> `bunx bract dev`

---

## Table of Contents

1. [Architecture Diagram](#1-architecture-diagram)
2. [Package Structure](#2-package-structure)
3. [User App Conventions](#3-user-app-conventions)
4. [Phased Implementation Roadmap](#4-phased-implementation-roadmap)
5. [Key Technical Decisions](#5-key-technical-decisions)
6. [Testing Strategy](#6-testing-strategy)
7. [Risk Register](#7-risk-register)

---

## 1. Architecture Diagram

### 1a. Server-Side Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INCOMING HTTP REQUEST                                                       │
│  GET /blog/42                                                                │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Bun.serve() fetch handler                                                  │
│  • Strips URL, method, headers into a standard Request object               │
│  • Detects /_data?path= soft-nav JSON requests → short-circuit to loader   │
│  • Serves /public/* static files via Bun.file() → early return             │
│  • Routes /_bract/* (HMR WS upgrade, client assets) → early return      │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MIDDLEWARE PIPELINE   use(fn) chain                                        │
│                                                                             │
│  ctx = { request, params:{}, context:{} }   ← mutable context object       │
│                                                                             │
│  → requestLogger(ctx, next)                                                 │
│  → cors(ctx, next)                                                          │
│  → authGuard(ctx, next)       ← attaches ctx.context.user                  │
│  → [user-registered middlewares]                                            │
│                                                                             │
│  Any middleware can return a Response early (e.g. 401 Unauthorized)        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ROUTER                                                                     │
│                                                                             │
│  routeTree = scanRoutes("./app/routes/")   ← built once, cached in dev     │
│                                                                             │
│  matchRoute("/blog/42", routeTree)                                          │
│  → { route: blog/[id], params: { id: "42" } }                              │
│  → resolves layout chain: root → blog/layout → blog/[id]                   │
│                                                                             │
│  No match → 404 using nearest ErrorBoundary                                │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PARALLEL LOADER EXECUTION                                                  │
│                                                                             │
│  Promise.all([                                                              │
│    rootLoader({ request, params, context }),                                │
│    layoutLoader({ request, params, context }),   ← if layout.tsx exports   │
│    routeLoader({ request, params, context }),    ← blog/[id] loader        │
│  ])                                                                         │
│                                                                             │
│  Each loader runs in parallel. If any throws, nearest ErrorBoundary wins.  │
│  defer() values are Promises — passed through to Suspense boundaries.      │
│  loaderData = { root: {...}, layout: {...}, route: {...} }                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ACTION HANDLER  (POST/PUT/DELETE only — runs before loaders)              │
│                                                                             │
│  formData = await request.formData()                                        │
│  actionData = await routeAction({ request, params, formData, context })    │
│  → can return data or redirect (throw redirect(url))                       │
│  → on redirect: 302 Response returned immediately, no SSR                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  META RESOLUTION                                                            │
│                                                                             │
│  mergedMeta = [                                                             │
│    ...rootMeta({ loaderData: root, params }),                               │
│    ...layoutMeta({ loaderData: layout, params }),   ← overrides root       │
│    ...routeMeta({ loaderData: route, params }),     ← overrides layout     │
│  ]                                                                          │
│  → deduped by name/property key, last-writer-wins                          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SSR RENDER  renderToReadableStream()                                       │
│                                                                             │
│  shell = <BractContext loaderData actionData params manifest>            │
│    <Root>                  ← app/root.tsx (provides <html>)                │
│      <Layout>              ← layout.tsx (if present)                       │
│        <RouteComponent />  ← blog/[id].tsx default export                  │
│      </Layout>             ← Suspense boundary wraps defer() promises      │
│    </Root>                                                                  │
│  </BractContext>                                                         │
│                                                                             │
│  renderToReadableStream(shell, {                                            │
│    onError(err) { logError(err); },   ← errors after 200 sent             │
│    bootstrapScripts: [manifest.clientEntry],                                │
│    bootstrapScriptContent: inlineLoaderData(loaderData, actionData),       │
│  })                                                                         │
│                                                                             │
│  • Shell streams immediately (<head>, meta tags, layout skeleton)          │
│  • defer() slots stream in as Promises resolve                             │
│  • bootstrapScriptContent inlines __BRACT_DATA__ for hydration          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STREAMING RESPONSE                                                         │
│                                                                             │
│  new Response(stream, {                                                     │
│    status: 200,                                                             │
│    headers: {                                                               │
│      "Content-Type": "text/html; charset=utf-8",                           │
│      "Transfer-Encoding": "chunked",                                        │
│      "Cache-Control": "no-store",                                           │
│    }                                                                        │
│  })                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1b. Client-Side Navigation Flow (Soft Nav)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER CLICKS <Link to="/blog/43">                                           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NavigationContext.navigate("/blog/43")                                     │
│  • setState({ state: "loading" })  → useNavigation() consumers update      │
│  • history.pushState({}, "", "/blog/43")                                    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
      ┌─────────────────────┐  ┌─────────────────────────┐
      │  Fetch route chunk  │  │  Fetch loader data      │
      │  (lazy import)      │  │  GET /_data?path=       │
      │  /blog/[id].js      │  │  /blog/43               │
      │  from manifest      │  │  → JSON { root, route } │
      └──────────┬──────────┘  └──────────┬──────────────┘
                 │                         │
                 └──────────┬──────────────┘
                            │  Promise.all([chunkLoad, dataFetch])
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  RouterContext updates                                                      │
│  • currentRoute = "/blog/43"                                                │
│  • loaderData = { route: fetched JSON }                                     │
│  • params = { id: "43" }                                                    │
│  • state = "idle"                                                           │
│  • React re-renders RouteOutlet with new lazy component                    │
│  • document.title updated from merged meta                                  │
│  • <meta> tags swapped in <head>                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1c. Action / Form Submission Flow

```
┌───────────────────────────────────────────────────────────────┐
│  USER SUBMITS <Form method="post" action="/blog/42">          │
└──────────────────────────────┬────────────────────────────────┘
                               │
                               ▼
        state = "submitting"  (useNavigation() updates)
                               │
                               ▼
        fetch("/blog/42", { method: "POST", body: formData })
                               │
                    ┌──────────┴──────────┐
                    │ redirect response   │ data response
                    ▼                     ▼
        navigate(location.header)   actionData stored
        (full soft-nav cycle)       loaders re-run
                                    state = "idle"
```

### 1d. HMR Flow (Dev Only)

```
  Bun.watch("./app") detects file change
         │
         ▼
  Re-scan routes (if routes/ changed)
  Re-run Bun.build() for client bundle
         │
         ▼
  WebSocket server (port 3001) broadcasts:
  { type: "hmr", file: "app/routes/blog/[id].tsx", duration: 142 }
         │
         ▼
  Browser HMR client receives message
  → Reloads page (full reload, Phase 3 MVP)
  → (Future: module-level hot swap)
```

---

## 2. Package Structure

```
bract/
│
├── package.json                  # name: "bract", bin: { bract: "./bin/cli.ts" }
├── tsconfig.json
├── build.ts                      # self-build script for the package itself
│
├── bin/
│   └── cli.ts                    # Entry: parses argv → dev | build | start | new
│
├── src/
│   │
│   ├── server/
│   │   ├── index.ts              # createServer() — main export for programmatic use
│   │   ├── serve.ts              # Bun.serve() wrapper, wires middleware + router
│   │   ├── router.ts             # scanRoutes(), matchRoute(), buildRouteTree()
│   │   ├── loader.ts             # runLoaders(), parallelFetch(), defer()
│   │   ├── action.ts             # runAction(), parseFormData()
│   │   ├── render.ts             # renderToReadableStream() wrapper, shell builder
│   │   ├── meta.ts               # resolveMeta(), mergeMeta(), injectMetaTags()
│   │   ├── middleware.ts         # MiddlewarePipeline, use(), compose()
│   │   ├── static.ts             # serveStatic() via Bun.file()
│   │   ├── manifest.ts           # loadManifest(), RouteManifest type
│   │   ├── session.ts            # createCookieSession(), getSession(), commitSession()
│   │   ├── response.ts           # redirect(), json(), error() helpers
│   │   └── env.ts                # validateEnv(), server-only guard
│   │
│   ├── client/
│   │   ├── entry.tsx             # hydrateRoot() entry — compiled to build/client.js
│   │   ├── router.tsx            # ClientRouter, RouterContext, NavigationContext
│   │   ├── components/
│   │   │   ├── Link.tsx          # <Link to prefetch> soft navigation
│   │   │   ├── Form.tsx          # <Form method action> fetch submission
│   │   │   ├── Scripts.tsx       # <Scripts /> — injects <script> tags from manifest
│   │   │   ├── LiveReload.tsx    # <LiveReload /> — dev-only HMR WebSocket client
│   │   │   └── Outlet.tsx        # <Outlet /> — renders current route component
│   │   ├── hooks/
│   │   │   ├── useLoaderData.ts  # reads RouterContext.loaderData for current route
│   │   │   ├── useActionData.ts  # reads RouterContext.actionData
│   │   │   ├── useParams.ts      # reads RouterContext.params
│   │   │   ├── useNavigation.ts  # reads NavigationContext.state
│   │   │   └── useFetcher.ts     # independent fetch/submit without navigation
│   │   └── prefetch.ts           # prefetchRoute() — hover intent loader prefetch
│   │
│   ├── build/
│   │   ├── bundler.ts            # Bun.build() orchestration — server + client targets
│   │   ├── manifest.ts           # generateManifest(), writeManifest()
│   │   ├── hash.ts               # contentHash() for asset fingerprinting
│   │   ├── split.ts              # route chunk splitting config
│   │   └── env-plugin.ts         # strips server-only imports from client bundle
│   │
│   ├── dev/
│   │   ├── watcher.ts            # Bun.watch() → rebuild → WS broadcast
│   │   ├── hmr-server.ts         # WebSocket server on port 3001
│   │   ├── hmr-client.ts         # Browser-side HMR listener (injected in dev)
│   │   └── error-overlay.ts      # Dev error overlay injected into HTML shell
│   │
│   ├── shared/
│   │   ├── context.ts            # BractContext React context (server + client)
│   │   ├── errors.ts             # BractError, HttpError, redirect detection
│   │   ├── deferred.ts           # Deferred<T>, isDeferred() — for defer() support
│   │   └── route-types.ts        # RouteModule interface (shared server + client)
│   │
│   └── middleware/
│       ├── requestLogger.ts      # Logs method, path, status, duration
│       ├── cors.ts               # CORS headers, preflight handling
│       └── authGuard.ts          # Reads session, attaches ctx.context.user
│
├── types/
│   ├── index.d.ts                # Re-exports all public types
│   ├── route.d.ts                # LoaderArgs, ActionArgs, MetaArgs, RouteModule
│   ├── config.d.ts               # BractConfig interface
│   ├── session.d.ts              # Session, SessionStorage interfaces
│   └── middleware.d.ts           # MiddlewareFn, MiddlewareContext
│
└── templates/
    └── new-app/
        ├── app/
        │   ├── root.tsx
        │   ├── routes/
        │   │   ├── _index.tsx
        │   │   └── about.tsx
        │   └── global.css
        ├── public/
        │   └── favicon.ico
        ├── bract.config.ts
        ├── package.json
        └── tsconfig.json
```

---

## 3. User App Conventions

### 3a. App Directory Structure

```
my-app/
│
├── bract.config.ts            # Framework configuration (optional)
│
├── app/
│   ├── root.tsx                  # REQUIRED — root layout, provides <html>
│   ├── client.tsx                # REQUIRED — client entry (re-exports from bract)
│   │
│   └── routes/
│       ├── _index.tsx            # → /
│       ├── about.tsx             # → /about
│       ├── blog/
│       │   ├── layout.tsx        # Nested layout for all /blog/* routes
│       │   ├── _index.tsx        # → /blog
│       │   └── [id].tsx          # → /blog/:id   (dynamic segment)
│       ├── docs/
│       │   └── [...slug].tsx     # → /docs/*     (catch-all)
│       └── $.tsx                 # → /* 404 catch-all (lowest priority)
│
├── public/                       # Served as static assets at /
│   ├── favicon.ico
│   └── robots.txt
│
└── build/                        # Generated by `bract build` — do not edit
    ├── server/
    │   └── index.js
    ├── client/
    │   ├── client.abc123.js      # Content-hashed
    │   └── chunks/
    │       ├── blog.[id].def456.js
    │       └── about.ghi789.js
    └── route-manifest.json
```

### 3b. Route Module Interface

Every file under `app/routes/` is a route module. All exports are optional except the default component export.

```typescript
import type { LoaderArgs, ActionArgs, MetaArgs } from "bract";

// ─── DATA ────────────────────────────────────────────────────────────────────

// Server-only. Runs on every GET request to this route.
export async function loader({ request, params, context }: LoaderArgs) {
  // context.user is available if authGuard middleware is registered
  const post = await db.post.findById(params.id);
  if (!post) throw new Response("Not Found", { status: 404 });
  return { post };
}

// Type helper: makes useLoaderData() fully typed
export type LoaderData = Awaited<ReturnType<typeof loader>>;

// Server-only. Runs on POST/PUT/DELETE to this route.
export async function action({ request, params, formData, context }: ActionArgs) {
  const title = formData.get("title") as string;
  await db.post.update(params.id, { title });
  return { ok: true };
  // or: throw redirect("/blog");
}

// ─── META ─────────────────────────────────────────────────────────────────────

// Merges with root and layout meta. Last-writer-wins on duplicate keys.
export function meta({ loaderData, params }: MetaArgs<LoaderData>) {
  return [
    { title: loaderData.post.title },
    { name: "description", content: loaderData.post.excerpt },
    { property: "og:title", content: loaderData.post.title },
  ];
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

// REQUIRED. Default export is the route UI.
export default function BlogPost() {
  const { post } = useLoaderData<LoaderData>();
  const action = useActionData();
  const params = useParams();
  const nav = useNavigation();

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}

// ─── DEFERRED DATA ────────────────────────────────────────────────────────────

// defer() lets the shell stream while slow data resolves in Suspense
export async function loader({ params }: LoaderArgs) {
  const post = await db.post.findById(params.id);      // fast — awaited
  const comments = db.comments.forPost(params.id);     // slow — not awaited
  return defer({ post, comments });
}

// In component:
// <Suspense fallback={<Spinner />}>
//   <Await resolve={comments}>{(c) => <CommentList comments={c} />}</Await>
// </Suspense>

// ─── ERRORS ───────────────────────────────────────────────────────────────────

// Replaces this route's component when loader/action throws.
// Bubbles to nearest parent ErrorBoundary if not defined here.
export function ErrorBoundary({ error }: { error: Error }) {
  return <div>Something went wrong: {error.message}</div>;
}

// ─── HANDLES ──────────────────────────────────────────────────────────────────

// (Optional) opt-out of layout for this route
export const handle = {
  noLayout: false,
  // add arbitrary metadata accessible from parent layouts
  breadcrumb: "Blog Post",
};
```

### 3c. app/root.tsx Interface

```tsx
import { Scripts, LiveReload, Outlet } from "bract";

export function loader() {
  return { user: getUser() };
}

export function meta() {
  return [{ title: "My App" }, { name: "viewport", content: "width=device-width" }];
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <html>
      <body><h1>Application Error</h1></body>
    </html>
  );
}

export default function Root() {
  return (
    <html lang="en">
      <head>
        {/* Bract injects <title> and <meta> here during SSR */}
      </head>
      <body>
        <Outlet />      {/* renders current route tree */}
        <Scripts />     {/* injects client bundle <script> tags */}
        <LiveReload />  {/* dev-only HMR socket — no-ops in production */}
      </body>
    </html>
  );
}
```

### 3d. bract.config.ts

```typescript
import type { BractConfig } from "bract";

export default {
  // Server
  port: 3000,
  hostname: "0.0.0.0",

  // Paths
  appDir: "./app",
  publicDir: "./public",
  buildDir: "./build",

  // Build
  sourcemap: "external",          // "none" | "inline" | "external"
  minify: true,                   // production only
  target: "bun",                  // server target

  // Features
  prefetchOnHover: true,          // <Link> prefetch on mouse enter
  streamingSSR: true,             // use renderToReadableStream (disable for debugging)

  // Environment
  // Keys listed here are injected into the client bundle as process.env.KEY
  // All others remain server-only
  clientEnv: ["PUBLIC_API_URL", "PUBLIC_STRIPE_KEY"],

  // Middleware (registered in order)
  middleware: [
    requestLogger(),
    cors({ origin: "*" }),
  ],
} satisfies BractConfig;
```

---

## 4. Phased Implementation Roadmap

### Phase 1a — Static SSR Shell

**Goal:** Prove the render pipeline end-to-end with a hardcoded route before any routing logic.

**Files to create:**
```
src/server/render.ts
src/server/serve.ts
src/server/response.ts
src/server/meta.ts           (stub)
src/shared/context.ts
src/client/components/Scripts.tsx
src/client/components/LiveReload.tsx
app/root.tsx                 (template)
```

**What to build:**
- `Bun.serve()` with a single hardcoded `fetch` handler
- `renderToReadableStream()` rendering a static `<Root>` component
- `bootstrapScriptContent` inlining `window.__BRACT_DATA__ = {}`
- `<Scripts />` component reads manifest and renders `<script src>` tags
- `<LiveReload />` renders a `<script>` that connects to WS on port 3001 (stub for now)
- Returns a streaming `Response` with correct `Content-Type`

**Acceptance criteria:**
- `bun run src/server/serve.ts` starts a server on port 3000
- `curl localhost:3000` returns valid HTML with `<html>` and `<body>`
- Response begins streaming before full render completes (verify with `curl -N`)
- No `window is not defined` errors (SSR guards in place)

**Complexity:** Low

---

### Phase 1b — File-Based Routing + Loaders

**Goal:** Dynamic route matching from `./app/routes/` with parallel loader execution.

**Files to create/modify:**
```
src/server/router.ts          # scanRoutes(), matchRoute(), buildRouteTree()
src/server/loader.ts          # runLoaders(), defer()
src/server/action.ts          # runAction(), redirect()
src/server/serve.ts           # wire router + loaders into fetch handler
src/shared/route-types.ts     # RouteModule, LoaderArgs, ActionArgs interfaces
```

**What to build:**
- `scanRoutes()` using `Bun.Glob` to collect all `app/routes/**/*.tsx` files
- Convert file paths → URL patterns: `[id]` → `:id`, `[...slug]` → `*`
- `matchRoute()` using a hand-rolled trie matcher (see §5 Key Decisions)
- Resolve layout chain: `blog/[id]` → `[root, blog/layout, blog/[id]]`
- `runLoaders()`: `Promise.all()` over root + layout + route loaders
- Thread `context` object (from middleware) into loader args
- `defer()` helper: returns a `Deferred` wrapper around a Promise
- POST/PUT/DELETE → `runAction()` before loaders, redirect support
- `/_data?path=` endpoint: returns `loaderData` as JSON for soft-nav

**Acceptance criteria:**
- `GET /blog/42` matches `app/routes/blog/[id].tsx`, `params.id === "42"`
- `GET /blog/42` runs root loader + blog layout loader + blog/[id] loader in parallel
- `GET /_data?path=/blog/42` returns `{ root: {...}, route: {...} }` JSON
- `POST /blog/42` runs action, redirect returns 302
- Unmatched routes return 404

**Complexity:** High

---

### Phase 2 — Client Hydration + Navigation Primitives

**Goal:** Hydrate SSR output on the client and enable soft navigation without page reloads.

**Files to create:**
```
src/client/entry.tsx          # hydrateRoot() bootstrapped from window.__BRACT_DATA__
src/client/router.tsx         # ClientRouter, RouterContext, NavigationContext
src/client/components/Link.tsx
src/client/components/Form.tsx
src/client/components/Outlet.tsx
src/client/hooks/useLoaderData.ts
src/client/hooks/useActionData.ts
src/client/hooks/useParams.ts
src/client/hooks/useNavigation.ts
src/client/hooks/useFetcher.ts
src/client/prefetch.ts
```

**What to build:**
- `window.__BRACT_DATA__` inlined by SSR as JSON in a `<script>` tag
- `hydrateRoot()` using inlined data — zero extra network requests on first load
- `RouterContext`: holds `{ loaderData, actionData, params, currentPath, manifest }`
- `NavigationContext`: holds `{ state: "idle" | "loading" | "submitting", navigate() }`
- `<Link>`: intercepts clicks, calls `navigate()`, prefetches on `mouseenter` if config enabled
- `<Form>`: intercepts submit, serializes `FormData`, `fetch()` to action URL
- `<Outlet>`: renders `React.lazy(() => import(chunkUrl))` for current route component
- `useFetcher()`: independent fetch/submit returning `{ data, state, submit(), load() }`
- State transitions: `idle → loading → idle` (navigation), `idle → submitting → idle` (form)
- After action: re-fetch loaders, update `loaderData`, set `actionData`
- On navigation: `Promise.all([importChunk, fetchLoaderData])` then update context
- Update `document.title` and `<meta>` tags after each navigation
- `prefetchRoute(href)`: on hover, preload chunk + loader data concurrently

**Acceptance criteria:**
- Clicking `<Link to="/about">` navigates without full page reload
- `useNavigation().state` is `"loading"` during navigation, `"idle"` after
- `useLoaderData()` returns correct data for the current route
- Submitting a `<Form method="post">` sends `fetch()`, re-runs loaders on success
- `useFetcher().submit()` can POST without triggering a navigation
- `document.title` updates on each navigation using route `meta()`
- No hydration mismatch warnings in console

**Complexity:** High

---

### Phase 3 — Dev Experience: HMR + Error Boundaries + defer()

**Goal:** Full developer experience with hot module replacement, error UI, and streaming deferred data.

**Files to create:**
```
src/dev/watcher.ts
src/dev/hmr-server.ts
src/dev/hmr-client.ts
src/dev/error-overlay.ts
src/shared/deferred.ts        # Deferred<T>, isDeferred(), Await component
src/shared/errors.ts          # BractError, HttpError, DefaultErrorBoundary
src/server/meta.ts            # full implementation with merge + dedup
```

**What to build:**
- `Bun.watch("./app")` triggers rebuild on any file change
- WebSocket server on port 3001 broadcasts `{ type: "hmr", file, duration }`
- `hmr-client.ts` injected via `<LiveReload />` — reloads page on `hmr` message
- `DefaultErrorBoundary`: in dev shows stack trace + file/line overlay; in prod shows generic "Something went wrong" + request ID
- Error bubbling: route → layout → root → `DefaultErrorBoundary`
- `defer({ slowData: Promise })`: SSR wraps in `<Suspense>`, streams when resolved
- `<Await resolve={promise}>{(data) => <UI />}</Await>` component
- On stream error after 200 sent: inject `<script>window.__BRACT_ERROR__=1</script>` into stream, client detects and shows error UI
- `meta()` full implementation: merge arrays, deduplicate by `name`/`property` key (last wins), inject into `<head>` during SSR
- `env.ts`: `*.server.ts` import guard — build plugin that throws if a `.server.ts` file is imported in a client chunk

**Acceptance criteria:**
- Editing `app/routes/about.tsx` rebuilds and browser reloads within 500ms
- Changed file path and rebuild duration printed to terminal
- Throwing in a loader renders `ErrorBoundary` (not a blank page)
- `defer()` causes shell to stream before slow data resolves — visible with `setTimeout` in loader
- `<title>` in SSR HTML matches route `meta()` output
- Importing `db.server.ts` in a route component throws a build error

**Complexity:** Medium

---

### Phase 4 — Build System: Bun.build() + Code Splitting + Manifest

**Goal:** Production build with content-hashed assets, code-split route chunks, and a route manifest.

**Files to create:**
```
src/build/bundler.ts          # orchestrates server + client Bun.build() calls
src/build/manifest.ts         # generateManifest(), writes route-manifest.json
src/build/hash.ts             # SHA-256 content hash, 8-char prefix
src/build/split.ts            # entrypoints config for route chunks
src/build/env-plugin.ts       # strips .server.ts imports from client bundle
bin/cli.ts                    # build + start commands
```

**What to build:**

Two separate `Bun.build()` calls:

```typescript
// 1. Server bundle
await Bun.build({
  entrypoints: ["src/server/index.ts"],
  target: "bun",
  outdir: "build/server",
  sourcemap: "external",
});

// 2. Client bundle (one entrypoint per route + main entry)
await Bun.build({
  entrypoints: [
    "src/client/entry.tsx",
    ...routeFiles,              // each route becomes its own chunk
  ],
  target: "browser",
  splitting: true,              // shared chunks extracted automatically
  outdir: "build/client",
  sourcemap: "external",
  minify: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    ...clientEnvDefines,        // only PUBLIC_* vars from config
  },
  plugins: [envGuardPlugin],    // blocks .server.ts imports
});
```

- `contentHash(file)`: SHA-256 of file contents → 8 hex chars
- Rename output files: `client.js` → `client.{hash}.js`
- Generate `build/route-manifest.json`:
```json
{
  "version": 1,
  "clientEntry": "/build/client/client.abc12345.js",
  "routes": {
    "/": { "chunk": "/build/client/chunks/_index.def45678.js" },
    "/blog/:id": { "chunk": "/build/client/chunks/blog.[id].ghi90123.js" }
  }
}
```
- `bract start`: `Bun.serve()` loads manifest, serves `build/server/index.js`
- Static file handler serves `build/client/*` with `Cache-Control: public, max-age=31536000, immutable`
- Server bundle served with `Cache-Control: no-store`

**Acceptance criteria:**
- `bract build` completes without errors
- `build/route-manifest.json` exists with all routes mapped to hashed filenames
- `bract start` serves the production build
- Running `bract build` twice with no changes produces identical hashes
- Changing one route file changes only that route's chunk hash
- No server-only code appears in any `build/client/*.js` file
- `Cache-Control: immutable` header on all `/build/client/*` responses

**Complexity:** High

---

### Phase 5 — Polish: Middleware + Sessions + CLI + Scaffold + Docs

**Goal:** Production-ready DX with full middleware system, session utilities, CLI scaffold, and documentation.

**Files to create:**
```
src/server/session.ts
src/server/middleware.ts      # full pipeline with context threading
src/middleware/requestLogger.ts
src/middleware/cors.ts
src/middleware/authGuard.ts
bin/cli.ts                   # full `new` command with template copy
templates/new-app/           # complete starter template
types/                       # full TypeScript declaration files
README.md
docs/                        # reference docs per feature
```

**What to build:**

Middleware pipeline with context threading:
```typescript
type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<Response>
) => Promise<Response>;

// ctx.context is passed to all loaders/actions:
// loader({ request, params, context: ctx.context })
```

Session utilities:
```typescript
const session = createCookieSession({
  name: "__session",
  secret: Bun.env.SESSION_SECRET,
  maxAge: 60 * 60 * 24 * 7,   // 1 week
  secure: true,
  sameSite: "lax",
});

// In loader:
const s = await session.getSession(request.headers.get("Cookie"));
const user = s.get("user");
return json({ user }, {
  headers: { "Set-Cookie": await session.commitSession(s) }
});
```

CLI `new` command:
```
bract new my-app
  ✔ Copying template...
  ✔ Installing react, react-dom...
  ✔ Writing package.json...

  cd my-app && bract dev
```

**Acceptance criteria:**
- `requestLogger` middleware logs every request with method, path, status, duration
- `cors()` middleware adds correct headers; preflight returns 204
- `authGuard()` attaches `context.user` from session; returns 401 if missing
- `context.user` is accessible in loaders without extra imports
- `createCookieSession` correctly signs, verifies, and expires cookies
- `bract new my-app` scaffolds a runnable app in under 10 seconds
- `bunx bract new` works from zero (no prior install)
- All public types exported from `bract` package root are fully typed

**Complexity:** Medium

---

## 5. Key Technical Decisions

### Decision 1: Route Matching Without path-to-regexp

**Approach:** Hand-rolled segment trie with priority scoring.

Convert file paths to segment arrays at startup:
```
app/routes/blog/[id].tsx  →  ["blog", { param: "id" }]
app/routes/blog/[...slug].tsx  →  ["blog", { catchAll: "slug" }]
app/routes/_index.tsx  →  []
```

Build a trie from all routes. On each request, walk URL segments through the trie.

Priority order (higher = tried first):
1. Exact static segment (`blog`) — score 3
2. Dynamic segment (`[id]`) — score 2
3. Catch-all (`[...slug]`) — score 1

First full match wins. This is O(depth) per request with no regex.

Ties broken by file system sort order (stable, deterministic).

**Rationale:** `path-to-regexp` is a Node.js dependency. Bun can run it, but it violates the zero-dependency constraint. The trie is ~80 lines of TypeScript and covers every case the framework needs. Tested independently with unit tests.

---

### Decision 2: Passing loaderData Without Double-Fetching

**Approach:** Inline serialized data in the HTML shell via `bootstrapScriptContent`.

During SSR:
```typescript
const inlineScript = `window.__BRACT_DATA__ = ${JSON.stringify({
  loaderData: { root: rootData, layout: layoutData, route: routeData },
  actionData,
  params,
  pathname: request.url,
})}`;

renderToReadableStream(shell, {
  bootstrapScriptContent: inlineScript,
  bootstrapScripts: [manifest.clientEntry],
});
```

Client entry reads `window.__BRACT_DATA__` synchronously before `hydrateRoot()`. No fetch needed. This is identical to how Remix handles it.

**Caveat:** Large loader data increases HTML payload. Document a `MAX_INLINE_SIZE` warning (>50KB) in dev mode. For very large data, the developer should paginate or use `defer()`.

---

### Decision 3: Concurrent Loaders (Root + Layout + Route)

**Approach:** `Promise.all()` with isolated error handling.

```typescript
const [rootData, layoutData, routeData] = await Promise.all([
  safeLoader(rootModule.loader, args),
  safeLoader(layoutModule?.loader, args),
  safeLoader(routeModule.loader, args),
]);

async function safeLoader(loader, args) {
  if (!loader) return null;
  try { return await loader(args); }
  catch (err) {
    if (isRedirect(err)) throw err;  // propagate redirects
    if (isResponse(err)) throw err;  // propagate HTTP errors
    return { __error: err };         // tag data errors for ErrorBoundary
  }
}
```

Redirects short-circuit everything (re-thrown). HTTP errors (e.g. `throw new Response("Not Found", { status: 404 })`) are caught, rendered with the correct status. Data errors are tagged and passed to the nearest `ErrorBoundary` as props.

`Promise.all()` means all three loaders start simultaneously — no waterfall.

---

### Decision 4: Lazy-Loading Route Components on the Client

**Approach:** Pre-built chunk map from the route manifest + `React.lazy()`.

During build, each route file becomes a separate Bun.build() entrypoint → its own output chunk. The manifest maps route pattern → chunk URL.

On the client:
```typescript
const chunkUrl = manifest.routes[currentPattern].chunk;
const LazyRoute = React.lazy(() => import(/* @vite-ignore */ chunkUrl));

// In <Outlet>:
<Suspense fallback={<RouteLoadingFallback />}>
  <LazyRoute />
</Suspense>
```

`import(chunkUrl)` works natively in modern browsers. No bundler plugin needed — just a dynamic import with a runtime string URL.

**Caveat:** The chunk URL must be absolute (e.g. `/build/client/chunks/blog.abc123.js`) or a fully qualified URL. The manifest stores them as absolute paths relative to the server root.

---

### Decision 5: useNavigation() State Transitions

**Approach:** Centralized NavigationContext with explicit state machine.

States: `idle → loading → idle` (for navigation) and `idle → submitting → idle` (for form submission).

```typescript
type NavigationState = "idle" | "loading" | "submitting";

const NavigationContext = createContext<{
  state: NavigationState;
  navigate: (to: string, opts?: NavOptions) => Promise<void>;
}>(null!);
```

`navigate()` is always `async`. It:
1. Sets state to `"loading"`
2. `await Promise.all([loadChunk(route), fetchLoaderData(path)])`
3. Calls `startTransition(() => { updateRouterContext(...); })` — React 18+ concurrent
4. Sets state to `"idle"`

`startTransition` is critical: it marks the route update as non-urgent, letting React keep the current UI interactive during the transition (spinner, disabled links, etc).

For forms: `state = "submitting"` while action fetch is in flight, `"loading"` while loaders re-run afterward, then `"idle"`.

---

### Decision 6: ErrorBoundary SSR + Client Consistency

**Approach:** Unified error detection using React's `ErrorBoundary` class component for client and a try/catch wrapper for SSR, both rendering the same error component.

**Server:**
```typescript
// If loader throws a non-redirect error, SSR renders the ErrorBoundary component:
const errorElement = React.createElement(
  routeModule.ErrorBoundary ?? DefaultErrorBoundary,
  { error: caughtError }
);
// Replaces the route component in the render tree
```

**Client:**
```typescript
// Wraps each route in a class ErrorBoundary:
class RouteErrorBoundary extends React.Component {
  componentDidCatch(error, info) { /* log */ }
  render() {
    if (this.state.error) {
      const EB = this.props.errorBoundary ?? DefaultErrorBoundary;
      return <EB error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

Both paths render the same `ErrorBoundary` export from the route module. The SSR output and the client tree match exactly, preventing hydration mismatches.

`DefaultErrorBoundary` checks `process.env.NODE_ENV`:
- **Development:** renders error message, stack trace, file/line (from `err.stack`), and a "copy error" button
- **Production:** renders generic message + a unique request ID (injected by the server) that developers can look up in logs

---

### Decision 7: `.server.ts` Import Guard

**Approach:** A Bun.build() plugin that throws on server-only imports in client bundles.

```typescript
const envGuardPlugin: BunPlugin = {
  name: "server-only-guard",
  setup(build) {
    build.onResolve({ filter: /\.server\.(ts|tsx)$/ }, (args) => {
      throw new Error(
        `[Bract] Cannot import server-only module "${args.path}" in client code.\n` +
        `Move this import to a loader() or action() function.`
      );
    });
  },
};
```

Applied only to the client `Bun.build()` call. Server build is unaffected.

Convention: any file named `*.server.ts` or `*.server.tsx` is server-only. Examples: `db.server.ts`, `auth.server.ts`.

---

### Decision 8: Environment Variable Safety

**Approach:** Allowlist in `bract.config.ts` + build-time `define`.

Only keys listed in `config.clientEnv` are exposed to the browser. All other `Bun.env.*` references in route files are stripped/undefined in client bundles via `Bun.build()`'s `define` option:

```typescript
// In bundler.ts — client build only
define: {
  ...Object.fromEntries(
    (config.clientEnv ?? []).map(key => [
      `process.env.${key}`,
      JSON.stringify(Bun.env[key] ?? ""),
    ])
  ),
  "process.env.NODE_ENV": JSON.stringify(Bun.env.NODE_ENV ?? "production"),
}
```

Any `process.env.SECRET_KEY` not in the allowlist becomes `undefined` in the client bundle. Document this clearly — it is not a security boundary (tree-shaking can be bypassed), it is a guardrail.

---

## 6. Testing Strategy

### Unit Tests — `bun test`

These are pure function tests with no server or browser required.

**Router Matcher (`src/server/router.ts`)**
```
✓ Matches exact static route: "/" → _index
✓ Matches dynamic segment: "/blog/42" → params.id = "42"
✓ Matches nested dynamic: "/blog/42/edit" → params.id = "42"
✓ Matches catch-all: "/docs/a/b/c" → params.slug = ["a","b","c"]
✓ Prefers static over dynamic: "/blog/new" → blog/new.tsx not blog/[id].tsx
✓ Prefers dynamic over catch-all
✓ Returns null for unmatched routes
✓ Resolves correct layout chain for nested routes
✓ Handles trailing slashes consistently
✓ Route scanning produces deterministic order
```

**Loader Pipeline (`src/server/loader.ts`)**
```
✓ Runs all three loaders in parallel (timing test with artificial delays)
✓ Redirect from any loader propagates and short-circuits
✓ Error in one loader doesn't cancel others
✓ defer() wraps Promise without awaiting it
✓ safeLoader returns __error tag on throw
✓ null loader returns null without throwing
```

**Meta Resolution (`src/server/meta.ts`)**
```
✓ Root meta alone renders correctly
✓ Route meta overrides root meta on same key
✓ Layout meta between root and route in priority
✓ Duplicate `name` keys deduplicated (last wins)
✓ Duplicate `property` keys deduplicated
✓ Missing meta() on route uses parent's
```

**Content Hash (`src/build/hash.ts`)**
```
✓ Same content → same hash
✓ Different content → different hash
✓ Hash is exactly 8 hex characters
✓ Empty file produces valid hash
```

**Session (`src/server/session.ts`)**
```
✓ getSession() on empty cookie returns empty session
✓ commitSession() produces signed cookie string
✓ getSession() on tampered cookie returns empty session
✓ set/get round-trip preserves value
✓ Expired session returns empty
```

---

### Integration Tests

Test the full server with `fetch()` against a running `Bun.serve()` instance started in `beforeAll`.

**SSR Output**
```
✓ GET / returns 200 with Content-Type: text/html
✓ HTML includes <html>, <head>, <body>
✓ <title> matches root meta()
✓ window.__BRACT_DATA__ is present and valid JSON
✓ Route component HTML is in the response body
✓ loader data is rendered into the component HTML
✓ 404 route returns 404 status
✓ Loader redirect returns 302 with Location header
✓ ErrorBoundary HTML rendered when loader throws
```

**Action Handling**
```
✓ POST returns 200 with action result
✓ POST with redirect returns 302
✓ formData values accessible in action handler
✓ GET to action-only route returns 405
```

**Soft Navigation API**
```
✓ GET /_data?path=/blog/42 returns JSON loaderData
✓ /_data respects auth middleware (returns 401 if unauthenticated)
✓ /_data returns 404 for unknown path
```

**Streaming**
```
✓ Response body begins before renderToReadableStream completes
✓ defer() values appear after initial shell in stream
✓ Large response doesn't timeout (chunked transfer)
```

---

### End-to-End Tests

Use Bun's `bun test` with a headless browser (via `playwright` — acceptable as a dev dependency, not a runtime dependency). Run against `bract dev` server.

**Soft Navigation**
```
✓ Clicking <Link to="/about"> changes URL without full reload
✓ useNavigation().state briefly shows "loading" (assert class on nav indicator)
✓ New route content renders after click
✓ Back button navigates correctly
✓ document.title updates on each navigation
✓ <meta name="description"> updates on navigation
```

**Form Submission**
```
✓ POST form submits via fetch (no page reload)
✓ useNavigation().state shows "submitting" during submission
✓ useActionData() populated after submission
✓ Redirect after action navigates to new page
```

**useFetcher**
```
✓ useFetcher().load() fetches without navigation
✓ useFetcher().submit() POSTs without navigation
✓ Multiple concurrent fetchers work independently
```

**Error Boundaries**
```
✓ Loader error renders ErrorBoundary component
✓ Hydration error renders ErrorBoundary without crash
✓ Error in one route doesn't affect unrelated routes
```

**HMR (dev only)**
```
✓ Editing a route file triggers rebuild (assert via WS message)
✓ Browser reloads after HMR message received
✓ Rebuild duration printed to terminal
```

---

### Coverage Targets

| Area | Target |
|---|---|
| Router matcher | 100% branch coverage |
| Loader pipeline | 90%+ |
| Meta resolution | 100% |
| SSR integration | 80%+ |
| E2E navigation | All happy paths + redirect |

Run with: `bun test --coverage`

---

## 7. Risk Register

### Risk 1: `renderToReadableStream` Error After Headers Sent

**Likelihood:** Medium — any async component or suspense boundary can fail mid-stream.

**Impact:** High — user sees partial HTML with no error indication; potentially broken layout.

**Mitigation:**
- Pass `onError(err)` to `renderToReadableStream`; log with request ID
- Inject an inline script at stream end that checks a sentinel: `<script>window.__BRACT_STREAM_OK__=1</script>`; if missing (stream aborted), client JS reloads or shows an error
- Wrap all `async` component rendering in `try/catch` at the route level, fall back to `ErrorBoundary`
- Document: loader errors are safe (caught before streaming); component errors during streaming are the dangerous case — advise keeping component render functions synchronous

---

### Risk 2: Hydration Mismatch Between SSR and Client

**Likelihood:** High in early development, Medium once patterns are established.

**Impact:** Medium — React re-renders from scratch (slow), console warnings, potential flicker.

**Mitigation:**
- Never use `Date.now()`, `Math.random()`, or browser APIs in component render paths on the server
- `<LiveReload />` and other dev-only components must render `null` during SSR — use `typeof window === "undefined"` guard
- `window.__BRACT_DATA__` must be serialized deterministically (sorted keys) to avoid ordering mismatches
- Add a dev-mode check: compare SSR HTML to `hydrateRoot` expected output, log mismatches with diff
- Test: integration test that asserts no React hydration warnings in browser console

---

### Risk 3: Bun.build() Splitting Behavior Differs From Expectations

**Likelihood:** Medium — Bun's splitter is newer and less battle-tested than Rollup/esbuild.

**Impact:** High — wrong chunks break lazy loading; shared code duplicated increases bundle size.

**Mitigation:**
- Pin to a specific Bun version in `package.json` engines field: `"bun": ">=1.2.0"`
- Write a build output test: assert each route chunk exists and its size is within expected range
- Manually verify the manifest maps all routes after every build
- Keep route modules thin — move business logic into `*.server.ts` files to reduce what the splitter has to reason about
- Fallback: if splitting causes issues, ship one large client bundle (no splitting) with a feature flag in config

---

### Risk 4: `.server.ts` Guard Does Not Catch All Leakage Paths

**Likelihood:** Medium — transitive imports can bypass filename-based checks.

**Impact:** Critical — database credentials, API keys, or ORM clients exposed in client bundle.

**Mitigation:**
- The Bun.build() plugin blocks `*.server.ts` by filename — enforce this as a hard rule in docs
- Add a post-build audit step: scan all client chunks for known server-only strings (`Bun.env`, `process.env.DATABASE_URL`, `import pg from`) using a simple grep script
- In dev, warn if any route component file directly imports from a `*.server.ts` (detect at route scan time before build)
- Future: add a `"use server"` / `"use client"` directive system as an alternative to filename convention

---

### Risk 5: Session Security — Cookie Signing Implementation

**Likelihood:** Low for correctness bugs, Medium for subtle timing attacks.

**Impact:** Critical — authentication bypass in production.

**Mitigation:**
- Use Bun's built-in `crypto` (`subtle.sign`, `subtle.verify` with HMAC-SHA256) — no external dependency needed
- Use constant-time comparison for signature verification (`timingSafeEqual` equivalent)
- Rotate secrets: support `secrets: [current, ...previous]` array in `createCookieSession` — verify against all, sign with first
- Never store sensitive data in the cookie value itself — store a session ID and keep data server-side
- Add a session test that verifies tampered cookies are rejected
- Document: `SESSION_SECRET` must be at least 32 bytes, generated with `openssl rand -base64 32`
```
