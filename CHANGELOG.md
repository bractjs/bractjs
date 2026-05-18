# Changelog

All notable changes to Bract are documented here.

---

## [Unreleased]

### Added

- **Server lifecycle hooks** — `onStart` and `onShutdown` callbacks on `BractJSConfig`
  - `onStart` runs once after the server begins accepting requests (DB connect, cache warm-up, etc.)
  - `onShutdown` runs before process exit — handles `SIGTERM`, `SIGINT`, `SIGUSR2`, `beforeExit`, and `uncaughtException` so connections are always closed
  - Signal handlers are registered once (module-level guard) — safe across HMR restarts
  - `gracefulShutdown` is idempotent — multi-signal storms do not double-invoke `onShutdown`
- **`defineLifecycle(hooks)`** — typed helper for declaring lifecycle hooks in `app/lifecycle.ts`
  - `LifecycleHooks` interface exported from the public API
- Dev server auto-loads `app/lifecycle.ts` (default export) if present

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
