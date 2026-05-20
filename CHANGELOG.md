# Changelog

All notable changes to Bract are documented here.

---

## [Unreleased]

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
