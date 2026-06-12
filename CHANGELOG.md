# Changelog

All notable changes to Bract are documented here.

---

## [Unreleased]

### Added

- **`useLocation()` + `RouterLocation`** — reactive `{ pathname, search, hash, state, key }`; SSR-safe (request-derived on the server). History entries are now stamped with a stable `key`, and `navigate`/`<Link>` accept `replace` and `state` options.
- **`<ScrollRestoration />`** — restores scroll position on back/forward and reload, scrolls to top (or the `#hash` element) on new navigations. Positions persist in sessionStorage (LRU-capped). Opt-in via `root.tsx`.
- **Link prefetch modes** — `prefetch="intent" | "viewport" | "render"` join `"hover"`. Prefetching now actually warms the loader cache (under the exact key the router computes, with a ≥30s freshness window) instead of issuing a discarded fetch; data prefetches are de-duplicated and capped at 6 concurrent; `"viewport"` uses one shared IntersectionObserver.
- **Typed, validated search params** — routes export `searchSchema` (Zod/Valibot/anything with `parse`/`safeParse`); the server validates/coerces before anything else runs (failure → 400; per-field leniency via `.catch()`). Loaders receive the output as `args.search`; the client reads it with `useSearch()` (validated object, numbers stay numbers — never re-validated client-side) and writes with `useSetSearch()` (functional patch → URL → soft-nav). `<Link>`/`useNavigate` accept a typed `search` option. `bractjs codegen` infers each route's search type from its schema (`Register.routes.searchOutput`), making the whole flow end-to-end typed. New exports: `useSearch`, `useSetSearch`, `validateSearch`, `searchParamsToObject`, `serializeSearch`, `SearchOutputFor`, `InferSchemaOutput`.
- **`useRevalidator()`** — manual loader revalidation (`{ revalidate, state }`) for refresh buttons/polling/out-of-band updates.
- **`shouldRevalidate` route export** — veto the SWR background refetch and post-mutation revalidation per route.
- **Fetcher overhaul for optimistic UI** — fetchers now live in a shared store: `useFetcher({ key })` gives a fetcher a stable cross-component identity; results expose `formData`/`formMethod` from the moment `submit()` is called (the optimistic-UI source) plus a scoped `<fetcher.Form>`; new `useFetchers()` returns every active fetcher. Fetcher submits now auto-revalidate the active route's loaders, and a successful mutation clears the loader cache.
- **Selective SSR** — per-route `export const ssr = false | "data-only"` with a `Fallback` component (HydrateFallback equivalent): `"data-only"` runs loaders on the server but renders the component client-only; `false` also skips the route loader during document SSR (the client completes via `/_data`). `beforeLoad` always runs server-side — not an auth bypass.
- **SPA mode** — `ssr: false` in `bractjs.config.ts` serves one static shell for every document GET ("no document SSR", not "no server": loaders, actions + CSRF, images, API routes all keep working). `bractjs build` emits `build/client/__spa.html`; dev renders the shell on the fly.
- **Prerendering (SSG)** — `prerender: ["/", "/about"]` (or a function) in config; `bractjs build` runs real loaders in-process and writes HTML + `/_data` payloads under `build/client/_prerender/`; production serves them for clean URLs before dynamic SSR (query strings stay dynamic). Exported as `runPrerender()`.
- **`serverModuleStubPlugin`** (client bundle) — replaces every export of a `*.server.ts` module with an inert, throwing stub instead of hard-failing the build.
  - BractJS ships the *entire* route module (loader + action included) to the client, so a route that does `import { db } from "./db.server.ts"` inside its loader pulls the server module into the client graph. The previous `serverOnlyPlugin` hard-failed that import, which made the documented "import a server module in a loader" pattern (README §17) impossible.
  - Stubbing keeps named/default imports resolvable so the route module compiles, guarantees **zero** server source (DB drivers, secrets, `bun:sqlite`) reaches the browser, and throws a clear error if a stub is ever actually invoked on the client.
  - Now used by the production build (`src/build/bundler.ts`), the dev rebuilder (`src/dev/rebuilder.ts`), and the dev HMR per-module handler (`src/dev/hmr-module-handler.ts`).
  - Exported from the public API; `extractExports` is now exported from `src/build/directives.ts` for reuse.
  - The stricter `serverOnlyPlugin` remains exported for opt-in use when you want a `*.server.ts` import to be a build error.

### Fixed

- **Soft navigation no longer wipes the document head.** The `/_data` payload now carries the route's merged `meta` (ClientRouter always read `data.meta` but the server never sent it, so every soft-nav reset title/description to nothing). Cached SWR commits update meta too.
- **`useNavigation()` can actually reach `"submitting"`.** `NavigationContext.submit` was a dead stub and `<Form>` bypassed it; `<Form>` now submits through the router, driving `"submitting"` → `"loading"` (revalidation) → `"idle"`.
- **`RouterContext.pathname` is always query-free.** Soft navigations previously stored `"/admin?x=1"` as the pathname; `location` is now the single source of truth and `pathname` derives from it. `<Form>` posts to `pathname + search` consistently.
- **Navigation no longer leaks the previous page's query string into the next page's loader fetch** (`navigate("/b")` from `/a?x=1` used to request `/_data?path=/b?x=1`).
- **`safeStringify` only flags true cycles.** A shared (non-cyclic) reference — e.g. a loader echoing `args.search` — was serialized as `"[Circular]"`, corrupting `__BRACTJS_DATA__`. Cycle detection now tracks the ancestor chain (MDN replacer pattern).
- **SECURITY: dev client builds now apply the same guard plugins as production.** `src/dev/rebuilder.ts` was missing `serverOnlyPlugin`/`clientEnvPlugin` entirely — a route importing a `*.server.ts` module (without a Bun builtin to trip the bundler) would have had that server source compiled and served to the browser over `/build/client` in dev, and `clientEnv` allow-listing was not applied. The rebuilder now runs `serverModuleStubPlugin`, `createUseServerProxyPlugin`, `clientEnvPlugin`, and `cssModulesPlugin`, matching `src/build/bundler.ts`.
- A `*.server.ts` import that pulled in a Bun builtin (e.g. `bun:sqlite`) previously surfaced a confusing raw `Browser build cannot import Bun builtin` error in dev instead of the intended server-only guard. It now stubs cleanly.
- **An action that *returns* a redirect now produces a real 3xx.** Previously only a *thrown* `redirect()` was honored; `return redirect("/")` (the documented pattern in README §5/§6/§15) was captured as `actionData` and wrapped into a `200` JSON body. The route handler (`src/server/request-handler.ts`) now propagates any `Response` an action returns — so the browser and `<Form>` see the 302 and follow it. Surfaced by manual (Playwright) testing of the todo example's "delete → redirect to board" flow.
- **`<Form>` now normalizes the post-redirect URL to a path before soft-navigating.** After following a redirect, `fetch().url` is absolute (e.g. `http://localhost:3000/`); the client router matches route patterns against a pathname, so the absolute URL produced a `/_data?path=http%3A%2F%2F…` 404 and the navigation silently failed. `src/client/components/Form.tsx` now converts a same-origin absolute redirect URL to `pathname + search + hash`.

### Tests

- `src/__tests__/server-module-stub.test.ts` — proves a route importing a `bun:sqlite`-backed `*.server.ts` builds, that no server source/secret/SQL reaches the client output, that named + default exports stay resolvable, that the stub throws when invoked, and that the legacy `serverOnlyPlugin` still hard-fails the same import.
- `src/__tests__/integration.test.ts` — added regression tests asserting that a route action which *returns* `redirect()` yields a `302` + `Location` for both the `X-BractJS-Action` (`<Form>`) and full-page POST paths (fixture: `routes/redirect-action.tsx`); plus `/_data` now carrying merged `meta`.
- New suites for this release: `nav-utils.test.ts` (parseTo/location keys), `scroll-restoration.test.ts`, `search-validation.test.ts` (unit + live-server searchSchema coercion/400s), `search-serializer.test.ts`, `fetcher-store.test.ts`, `revalidation.test.ts` (mutation → revalidate contract), `selective-ssr.test.ts` (Fallback SSR, loader skipping, beforeLoad parity), `spa-mode.test.ts` (shell serving + CSRF intact), `prerender.test.ts` (generation + production file serving). `typed-routing.test.ts` extended with `useSearch`/`useSetSearch`/`<Link search>` type-level assertions.

---

## [0.1.23] — 2026-05-20

### Added

- **Native `bun build --compile` support** — package a BractJS app as a single executable
  - Module-registry codegen (`bractjs codegen:registry`) writes static `import` statements for every route, layout, root, and `"use server"` module into `app/_generated/{routes,actions}.ts` so Bun's bundler can trace them
  - Manifest codegen (`bractjs codegen:manifest`) snapshots `build/route-manifest.json` into `app/_generated/manifest.ts` as an inline `ServerManifest` constant — no disk read at startup
  - `bractjs compile [outfile]` runs the full pipeline (registry codegen → build → manifest codegen → `bun build --compile`)
  - `BractJSConfig` accepts `routeFiles`, `moduleRegistry`, `actionModules` — when all are present, the server boots with zero `Bun.Glob` scans and zero dynamic `import(absPath)` calls
  - `resolveRouteChain` has a registry-aware code path that looks modules up by appDir-relative key instead of dynamic import
  - `loadServerActionsFromRegistry()` companion to `loadServerActions()` — registers pre-imported action modules
  - `serveStatic` falls back to `Bun.file()` when `realpath()` throws (embedded virtual paths in compiled binaries); the structural traversal guard still runs first
- **Stable server-action IDs** — `computeId` (server) and `actionId` (client proxy plugin) now hash the appDir-relative path instead of the absolute path
  - IDs stay consistent across CI / build machine / production server / compiled binary; previously a path difference produced silent `/_action?id=...` 404s
  - `useServerProxyPlugin` becomes a factory: `createUseServerProxyPlugin(appDir)`. The constant export remains for backwards compatibility (legacy absolute-path mode)
- **Build plugins exported from the public API** — required when composing a custom `Bun.build()` (e.g. for the single-binary workflow)
  - `useClientStubPlugin` (server bundle)
  - `createUseServerProxyPlugin(appDir)` (client bundle)
  - `serverOnlyPlugin` (client bundle)
  - `clientEnvPlugin(allowedKeys, env)` (client bundle)
  - `cssModulesPlugin` was already exported
  - **SECURITY:** missing `createUseServerProxyPlugin` on a custom client build ships server-action bodies (DB queries, secrets) inside the browser JS
- **`RouteFile`, `Segment`, `ModuleRegistry` types** added to the public API
- **`app/server.ts`** template entry added to the scaffold (`bractjs new`)
- **Server lifecycle hooks** — `onStart` and `onShutdown` callbacks on `BractJSConfig`
  - `onStart` runs once after the server begins accepting requests (DB connect, cache warm-up, etc.)
  - `onShutdown` runs before process exit — handles `SIGTERM`, `SIGINT`, `SIGUSR2`, `beforeExit`, and `uncaughtException` so connections are always closed
  - Signal handlers are registered once (module-level guard) — safe across HMR restarts
  - `gracefulShutdown` is idempotent — multi-signal storms do not double-invoke `onShutdown`
- **`defineLifecycle(hooks)`** — typed helper for declaring lifecycle hooks in `app/lifecycle.ts`
  - `LifecycleHooks` interface exported from the public API
- Dev server auto-loads `app/lifecycle.ts` (default export) if present

### Changed

- `resolveRouteChain` now accepts an optional `registry` parameter; dev-mode behavior (dynamic import) is preserved when omitted
- `HandlerConfig` gains a `moduleRegistry` field threaded through the request pipeline
- `safeRealpath` in `src/server/static.ts` now falls back to a direct existence check when `realpath()` throws — required for `bun build --compile --asset` embedded paths; the structural `startsWith(root + sep)` traversal guard runs unconditionally before any I/O
- **`createServer().stop()` no longer calls `process.exit()`** — previously, `stop()` triggered an immediate process termination via `gracefulShutdown → process.exit(0)`. This made the server impossible to use inside a Bun test or any parent process that wanted to keep running after stopping a listener. The new contract: `stop()` runs the user's `onShutdown` hook, closes the adapter, and returns. Signal handlers (`SIGTERM`/`SIGINT`/`SIGUSR2`/`uncaughtException`) keep their explicit `process.exit()` because termination is the intent there. **Migration:** if you previously relied on `srv.stop()` to terminate the process, call `process.exit(0)` yourself afterwards.
- `process.on("beforeExit")` handler no longer calls `process.exit()` either — `beforeExit` fires when the event loop is naturally draining; re-entering the exit path from inside it caused test runners to hang forever waiting for a clean exit code. Now it just runs the shutdown hook and stops the listener.

### Fixed

- `bun test` no longer hangs when a test creates and stops a server (`src/__tests__/security.test.ts`, `src/__tests__/integration.test.ts`). Root cause was the `beforeExit` / `stop()` calls into `process.exit(0)` (see Changed above). Full test suite now runs end-to-end: 225 tests across 23 files.
- TypeScript: `src/client/ClientRouter.tsx` dynamic import of the dev-only DevTools panel (`"/_bractjs/devtools.js"`, a runtime URL served by `serve.ts`) is now annotated with `// @ts-expect-error TS2307` and an explanatory comment. The path can't be resolved at compile time but is intentional at runtime — the `.catch()` swallows the import failure in production.

### Scaffold

- `bractjs new` now seeds `app/_generated/{routes,actions,manifest}.ts` immediately after `bun install` so the scaffolded `app/server.ts` typechecks before the user runs a build. The manifest stub is a placeholder — replaced by `bractjs codegen:manifest` after the first `bractjs build`.
- New `templates/new-app/.gitignore` covers `app/_generated/`, `build/`, `node_modules/`, `.bract-image-cache/`, and standard env files.
- Repo `.gitignore`: added `app/_generated/` and `src/__tests__/.tmp-*` so codegen output and test fixture leaks don't get committed.

---

## [0.1.0] — 2026-05-11

### Added

#### Core SSR
- `createServer()` — `Bun.serve()` entry with streaming SSR via `renderToReadableStream`
- File-based routing via `Bun.Glob` with `scanRoutes()`
- Route trie matcher (static > param > catch-all priority, no regex)
- Layout chain resolution (`root.tsx → routes/**/layout.tsx → route`)
- Parallel loader execution (`Promise.all`) with error isolation
- Action handler for `POST` / `PUT` / `DELETE`
- `/_data?path=` JSON endpoint for soft-nav data fetching
- `redirect()`, `json()`, `error()` response helpers
- `meta()` resolution — full merge + dedup (last-writer-wins), SSR-injected into `<head>`

#### Streaming
- `defer()` helper — returns resolved values immediately, streams promises
- `<Await>` component — React 19 `use()` + `<Suspense>` for deferred data

#### Client
- `hydrateRoot()` browser entry with `window.__BRACTJS_DATA__` hydration
- `ClientRouter` — `RouterContext` + `NavigationContext` with `startTransition`
- `<Link>` — soft navigation, `prefetch="hover"` (chunk + data preload)
- `<Form>` — fetch-based submission, auto loader reload
- `<Outlet>` — `React.lazy()` route rendering with `RouteErrorBoundary`
- `useLoaderData<T>()`, `useActionData<T>()`, `useParams()`, `useNavigation()`
- `useFetcher()` — independent background fetch/submit
- Browser back/forward support (`popstate` listener)

#### Dev Experience
- File watcher via `node:fs watch` with 50ms debounce
- HMR WebSocket server (port 3001) + auto-reload browser client
- Dev error overlay — full-screen stack trace injected into HTML
- `DefaultErrorBoundary` (stack in dev, generic message in prod)
- `RouteErrorBoundary` class component

#### Build System
- Dual `Bun.build()` — server bundle (`target: "bun"`) + client bundle (`target: "browser"`)
- Route code splitting — one chunk per route file
- Content-hash filenames (`SHA-256`, 8-char prefix) for cache busting
- `build/route-manifest.json` — maps URL patterns to hashed chunk paths
- `.server.ts` import guard plugin — build error if server file imported in client
- `clientEnv` allowlist — `process.env.*` define-stripping at build time
- `Cache-Control: public, max-age=31536000, immutable` for hashed client assets
- `Cache-Control: no-cache` for `public/` assets

#### Middleware
- `MiddlewarePipeline` — composable `use()` + `run()` with full context threading
- `requestLogger()` — `[METHOD] /path → status in Xms`
- `cors({ origin, methods? })` — `Access-Control-Allow-*` headers + OPTIONS preflight
- `authGuard({ session, required? })` — cookie session → `ctx.context.user`

#### Session
- `createCookieSession()` — HMAC-SHA256 signing via `crypto.subtle`
- Base64url encode/decode, constant-time signature verification
- Secret rotation support (`secrets: [current, ...previous]`)
- `Set-Cookie` builder with `HttpOnly`, `Secure`, `SameSite`, `Max-Age`, `Path=/`

#### TypeScript
- Full declaration files under `types/` — `route.d.ts`, `config.d.ts`, `session.d.ts`, `middleware.d.ts`, `index.d.ts`
- `package.json` conditional exports with `"types"` field

#### CLI
- `bractjs new <name>` — scaffold a new app from `templates/new-app/`
- `bractjs dev` — starts dev server + HMR
- `bractjs build` — production build
- `bractjs start` — production server
